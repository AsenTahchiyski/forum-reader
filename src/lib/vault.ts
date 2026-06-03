/**
 * The credential vault: high-level lock / unlock and secret encryption.
 *
 * The data-encryption key (DEK) lives in module memory only while unlocked and
 * is cleared on lock. Persisted state (the wrapped DEK + salts) lives in the
 * `vault` Dexie table; forum secrets are AES-GCM blobs on each forum row.
 */
import {
  clearSessionCache,
  clearVault,
  db,
  getSessionCache,
  getVault,
  putSessionCache,
  putVault
} from '../db/db';
import type { EncBlob, ForumSecrets, UnlockMethod } from '../db/types';
import {
  decryptJson,
  deriveKeyFromPassphrase,
  deriveKeyFromPrf,
  encryptJson,
  fromB64,
  generateDek,
  randomBytes,
  toB64,
  unwrapDek,
  wrapDek
} from './crypto';
import { getPrfOutput, registerPrfCredential } from './webauthn';

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

export function lock(): void {
  dek = null;
  void forgetSession();
  emit();
}

// ---- Reload persistence ---------------------------------------------------
//
// Keep the unlocked key alive across page reloads (but not a fresh app launch)
// by caching it in IndexedDB behind a sessionStorage marker. sessionStorage is
// per-tab and cleared when the tab/PWA closes, so it cleanly separates "reload"
// from "cold start" without ever writing the key into sessionStorage itself.

const SESSION_KEY = 'fr_session';

/** Persist the live DEK so the next reload in this tab can pick it back up. */
async function cacheSession(): Promise<void> {
  if (!dek) return;
  try {
    const sessionId = toB64(randomBytes(16));
    sessionStorage.setItem(SESSION_KEY, sessionId);
    await putSessionCache({ id: 'dek', sessionId, key: dek });
  } catch {
    // sessionStorage / IndexedDB may be unavailable (private mode, etc.).
    // Unlocking still works; the user just re-unlocks after a reload.
  }
}

/** Drop the cached key and its marker. */
async function forgetSession(): Promise<void> {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    await clearSessionCache();
  } catch {
    /* ignore */
  }
}

/**
 * Attempt to restore the DEK after a reload. Returns true if the vault is now
 * unlocked. On a cold start (no matching sessionStorage marker) the stale key
 * is purged so it never lingers at rest, and the caller shows the unlock UI.
 */
export async function restoreSession(): Promise<boolean> {
  if (dek) return true;
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    const row = await getSessionCache();
    if (sessionId && row && row.sessionId === sessionId) {
      dek = row.key;
      emit();
      return true;
    }
  } catch {
    /* fall through to purge */
  }
  await forgetSession();
  return false;
}

export async function hasVault(): Promise<boolean> {
  return Boolean(await getVault());
}

export async function vaultMethod(): Promise<UnlockMethod | null> {
  const v = await getVault();
  return v?.method ?? null;
}

export async function hasPassphraseUnlock(): Promise<boolean> {
  const v = await getVault();
  return !!v && (v.method === 'passphrase' || !!v.passphraseWrap);
}

// ---- Setup ----------------------------------------------------------------

export async function setupWithBiometric(): Promise<void> {
  const prfSalt = randomBytes(32);
  const reg = await registerPrfCredential(prfSalt);
  if (!reg) {
    throw new Error(
      'This device did not provide a biometric secret. Set up a passphrase instead.'
    );
  }
  const hkdfSalt = randomBytes(32);
  const wrappingKey = await deriveKeyFromPrf(reg.prfOutput, hkdfSalt);
  const freshDek = await generateDek();
  const wrappedDek = await wrapDek(freshDek, wrappingKey);

  await putVault({
    id: 'default',
    method: 'webauthn',
    wrappedDek,
    salt: toB64(hkdfSalt),
    credentialId: reg.credentialId,
    prfSalt: toB64(prfSalt),
    createdAt: Date.now()
  });
  dek = freshDek;
  await cacheSession();
  emit();
}

export async function setupWithPassphrase(passphrase: string): Promise<void> {
  const salt = randomBytes(16);
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const freshDek = await generateDek();
  const wrappedDek = await wrapDek(freshDek, wrappingKey);

  await putVault({
    id: 'default',
    method: 'passphrase',
    wrappedDek,
    salt: toB64(salt),
    createdAt: Date.now()
  });
  dek = freshDek;
  await cacheSession();
  emit();
}

/** Add a passphrase as a recovery method to an existing (unlocked) vault. */
export async function addPassphraseFallback(passphrase: string): Promise<void> {
  if (!dek) throw new Error('Unlock the vault first.');
  const v = await getVault();
  if (!v) throw new Error('No vault to update.');
  const salt = randomBytes(16);
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const wrappedDek = await wrapDek(dek, wrappingKey);
  await putVault({
    ...v,
    passphraseWrap: { wrappedDek, salt: toB64(salt) }
  });
}

// ---- Unlock ---------------------------------------------------------------

export async function unlockWithBiometric(): Promise<void> {
  const v = await getVault();
  if (!v || v.method !== 'webauthn' || !v.credentialId || !v.prfSalt) {
    throw new Error('No biometric vault is configured.');
  }
  const prfOutput = await getPrfOutput(v.credentialId, fromB64(v.prfSalt));
  const wrappingKey = await deriveKeyFromPrf(prfOutput, fromB64(v.salt));
  dek = await unwrapDek(v.wrappedDek, wrappingKey);
  await cacheSession();
  emit();
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const v = await getVault();
  if (!v) throw new Error('No vault is configured.');

  try {
    if (v.method === 'passphrase') {
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
  await cacheSession();
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
 * Destroy the vault and every stored forum (their secrets become permanently
 * undecryptable once the DEK is gone). Used for "forget everything" / recovery.
 */
export async function resetVault(): Promise<void> {
  await db.transaction('rw', db.vault, db.forums, async () => {
    await clearVault();
    await db.forums.clear();
  });
  lock();
}
