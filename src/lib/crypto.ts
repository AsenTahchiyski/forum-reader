/**
 * Low-level cryptographic primitives for the credential vault.
 *
 * Model: a random 256-bit AES-GCM data-encryption key (DEK) encrypts every
 * forum's secrets. The DEK itself is never stored in the clear — it is
 * "wrapped" (encrypted) by a key derived either from a WebAuthn PRF output
 * (biometric unlock) or a passphrase (PBKDF2). Unlocking re-derives that
 * wrapping key, decrypts the DEK, and keeps it in memory only.
 */
import type { EncBlob } from '../db/types';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64 helpers -------------------------------------------------------

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return fromB64(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
}

export function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

// ---- AES-GCM --------------------------------------------------------------

export async function aesEncrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer | Uint8Array
): Promise<EncBlob> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ct: toB64(ct), iv: toB64(iv) };
}

export async function aesDecrypt(
  key: CryptoKey,
  blob: EncBlob
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv) },
    key,
    fromB64(blob.ct)
  );
  return new Uint8Array(pt);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncBlob> {
  return aesEncrypt(key, enc.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, blob: EncBlob): Promise<T> {
  const bytes = await aesDecrypt(key, blob);
  return JSON.parse(dec.decode(bytes)) as T;
}

// ---- Data-encryption key (DEK) -------------------------------------------

/** Generate a fresh, extractable 256-bit AES-GCM key to act as the DEK. */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ]);
}

/** Wrap (encrypt) the DEK's raw bytes with a wrapping key. */
export async function wrapDek(
  dek: CryptoKey,
  wrappingKey: CryptoKey
): Promise<EncBlob> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  return aesEncrypt(wrappingKey, raw);
}

/**
 * Decrypt the wrapped DEK and import it. Imported as extractable so the DEK
 * can be re-wrapped later (e.g. when adding a passphrase fallback). This does
 * not weaken security meaningfully: anything able to run JS here can already
 * use the live key to decrypt secrets.
 */
export async function unwrapDek(
  blob: EncBlob,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const raw = await aesDecrypt(wrappingKey, blob);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt'
  ]);
}

// ---- Wrapping-key derivation ---------------------------------------------

const PBKDF2_ITERATIONS = 310_000;

/** Derive an AES-GCM wrapping key from a passphrase (PBKDF2-SHA256). */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derive an AES-GCM wrapping key from a WebAuthn PRF output (HKDF-SHA256). */
export async function deriveKeyFromPrf(
  prfOutput: ArrayBuffer,
  salt: Uint8Array
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
    'deriveKey'
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      info: enc.encode('forum-reader-vault'),
      hash: 'SHA-256'
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
