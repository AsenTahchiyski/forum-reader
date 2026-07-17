import type { Lang } from '../lib/i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * How the credential vault's data-encryption key is unwrapped. 'none' means
 * the key is stored on-device and the app auto-unlocks at startup (Tapatalk
 * style); 'webauthn' / 'passphrase' are legacy locked vaults kept only so
 * they can be unlocked one final time and converted.
 */
export type UnlockMethod = 'none' | 'webauthn' | 'passphrase';

/** A chunk of AES-GCM ciphertext stored as base64 strings. */
export interface EncBlob {
  /** base64 ciphertext */
  ct: string;
  /** base64 12-byte IV */
  iv: string;
}

export interface Settings {
  id: 'default';
  themeMode: ThemeMode;
  accentColor: string;
  /** Forum opened automatically on launch, if set. */
  favoriteForumId: number | null;
  /** Base URL of the user's self-hosted relay Worker, e.g. https://x.workers.dev */
  proxyBaseUrl: string;
  /**
   * Shared secret for the relay Worker. Lower-stakes than forum passwords (it
   * only gates the user's own proxy), so kept here rather than in the vault.
   */
  relayToken: string;
  /** Render images / YouTube embeds inline in posts. */
  showMedia: boolean;
  /** UI language; unset means "follow the browser". */
  language?: Lang;
  onboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * A configured forum. Secrets (password, relay token) live only inside
 * `secrets`, AES-GCM encrypted with the vault's data-encryption key — never
 * in plaintext at rest.
 */
export interface ForumAccount {
  id?: number;
  name: string;
  /** Board root URL the user entered, e.g. https://example.com/forum */
  baseUrl: string;
  /** Resolved mobiquo endpoint, e.g. https://example.com/forum/mobiquo/mobiquo.php */
  mobiquoUrl: string;
  username: string;
  /** Encrypted JSON: { password, relayToken? }. */
  secrets: EncBlob;
  avatarUrl?: string;
  /** Accent color sniffed from the forum's get_config (best effort). */
  brandColor?: string;
  createdAt: number;
  updatedAt: number;
}

/** Decrypted shape held only in memory while unlocked. */
export interface ForumSecrets {
  password: string;
}

/**
 * Singleton vault record. The data-encryption key (DEK) is generated once.
 * With method 'none' its raw bytes are stored in `dekRaw` and loaded at
 * startup without prompting. Legacy locked vaults instead store the DEK
 * wrapped by a key derived from a WebAuthn PRF output or a passphrase.
 */
export interface VaultRecord {
  id: 'default';
  method: UnlockMethod;
  /** base64 raw DEK when method === 'none'. */
  dekRaw?: string;
  /** Wrapped (encrypted) DEK for legacy locked methods. */
  wrappedDek?: EncBlob;
  /** base64 salt for HKDF (webauthn) or PBKDF2 (passphrase). */
  salt?: string;
  /** WebAuthn credential id (base64url) when method === 'webauthn'. */
  credentialId?: string;
  /** base64 32-byte salt fed to the PRF extension when method === 'webauthn'. */
  prfSalt?: string;
  /** Optional passphrase fallback wrap, present alongside a webauthn primary. */
  passphraseWrap?: {
    wrappedDek: EncBlob;
    salt: string;
  };
  createdAt: number;
}
