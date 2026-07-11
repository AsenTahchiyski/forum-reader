/**
 * The credential vault: secret encryption without a startup lock.
 *
 * The data-encryption key (DEK) is stored on-device in the `vault` Dexie
 * table and loaded automatically at startup — no unlock prompt, matching how
 * apps like Tapatalk keep forum logins. Forum secrets stay AES-GCM blobs on
 * each forum row so they are opaque to casual inspection, but anyone with
 * access to this browser profile can decrypt them.
 *
 * Legacy vaults created behind a biometric/passphrase lock are unlocked one
 * final time (the DEK can't be recovered without it) and converted to the
 * no-lock format on success.
 */
import { clearVault, db, getVault, putVault } from '../db/db';
import type { EncBlob, ForumSecrets } from '../db/types';
import {
  decryptJson,
  deriveKeyFromPassphrase,
  deriveKeyFromPrf,
  encryptJson,
  fromB64,
  generateDek,
  importDek,
  toB64,
  unwrapDek
} from './crypto';
import { getPrfOutput } from './webauthn';

let dek: CryptoKey | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUnlocked(): boolean {
  return dek !== null;
}

// ---- Startup --------------------------------------------------------------

/** Store the live DEK as a no-lock vault record so startup never prompts. */
async function persistNoLock(createdAt: number): Promise<void> {
  if (!dek) return;
  const raw = await crypto.subtle.exportKey('raw', dek);
  await putVault({
    id: 'default',
    method: 'none',
    dekRaw: toB64(raw),
    createdAt
  });
}

/**
 * Make the vault usable without user interaction: create it on first run,
 * load the stored DEK otherwise. Returns false only for a legacy locked
 * vault, which still needs one manual unlock (and is converted then).
 */
export async function ensureUnlocked(): Promise<boolean> {
  if (dek) return true;
  const v = await getVault();
  if (!v) {
    dek = await generateDek();
    await persistNoLock(Date.now());
    emit();
    return true;
  }
  if (v.method === 'none' && v.dekRaw) {
    dek = await importDek(fromB64(v.dekRaw));
    emit();
    return true;
  }
  return false;
}

// ---- Legacy unlock (one final time, then converted) ------------------------

export async function vaultMethod(): Promise<string | null> {
  const v = await getVault();
  return v?.method ?? null;
}

export async function hasPassphraseUnlock(): Promise<boolean> {
  const v = await getVault();
  return !!v && (v.method === 'passphrase' || !!v.passphraseWrap);
}

export async function unlockWithBiometric(): Promise<void> {
  const v = await getVault();
  if (!v || v.method !== 'webauthn' || !v.credentialId || !v.prfSalt || !v.salt || !v.wrappedDek) {
    throw new Error('No biometric vault is configured.');
  }
  const prfOutput = await getPrfOutput(v.credentialId, fromB64(v.prfSalt));
  const wrappingKey = await deriveKeyFromPrf(prfOutput, fromB64(v.salt));
  dek = await unwrapDek(v.wrappedDek, wrappingKey);
  await persistNoLock(v.createdAt);
  emit();
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const v = await getVault();
  if (!v) throw new Error('No vault is configured.');

  try {
    if (v.method === 'passphrase' && v.wrappedDek && v.salt) {
      const wrappingKey = await deriveKeyFromPassphrase(passphrase, fromB64(v.salt));
      dek = await unwrapDek(v.wrappedDek, wrappingKey);
    } else if (v.passphraseWrap) {
      const wrappingKey = await deriveKeyFromPassphrase(
        passphrase,
        fromB64(v.passphraseWrap.salt)
      );
      dek = await unwrapDek(v.passphraseWrap.wrappedDek, wrappingKey);
    } else {
      throw new Error('No passphrase recovery is set for this vault.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('No passphrase')) throw err;
    throw new Error('Incorrect passphrase.');
  }
  await persistNoLock(v.createdAt);
  emit();
}

// ---- Secret encryption ----------------------------------------------------

export async function encryptSecrets(secrets: ForumSecrets): Promise<EncBlob> {
  if (!dek) throw new Error('Vault is locked.');
  return encryptJson(dek, secrets);
}

export async function decryptSecrets(blob: EncBlob): Promise<ForumSecrets> {
  if (!dek) throw new Error('Vault is locked.');
  return decryptJson<ForumSecrets>(dek, blob);
}

/**
 * Destroy every stored forum and rotate the DEK (old secrets become
 * permanently undecryptable). The app stays usable with a fresh empty vault.
 */
export async function resetVault(): Promise<void> {
  await db.transaction('rw', db.vault, db.forums, async () => {
    await clearVault();
    await db.forums.clear();
  });
  dek = await generateDek();
  await persistNoLock(Date.now());
  emit();
}
