/**
 * WebAuthn helpers for biometric unlock via the PRF extension.
 *
 * The PRF (pseudo-random function) extension lets us derive a stable secret
 * from a platform passkey *after* a user-verification (Touch ID / Face ID /
 * fingerprint / Windows Hello). We feed that secret into HKDF to obtain the
 * key that wraps the vault's DEK — so the wrapping key only ever exists
 * transiently, right after a biometric check.
 */
import { fromB64Url, randomBytes, toB64Url } from './crypto';

// The PRF extension isn't in the standard TS DOM lib yet; describe what we use.
interface PrfExtensionInput {
  prf?: { eval?: { first: BufferSource } };
}
interface PrfExtensionOutput {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

export interface PrfRegistration {
  credentialId: string; // base64url
  prfOutput: ArrayBuffer;
}

/** True when the platform can do user-verifying WebAuthn (a precondition for PRF). */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (
      typeof PublicKeyCredential === 'undefined' ||
      !navigator.credentials?.create
    ) {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new platform passkey and capture its PRF output for `prfSalt`.
 * Returns null when the authenticator doesn't actually deliver a PRF result
 * (caller should then fall back to a passphrase).
 */
export async function registerPrfCredential(
  prfSalt: Uint8Array
): Promise<PrfRegistration | null> {
  const extensions: PrfExtensionInput = { prf: { eval: { first: prfSalt } } };
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Forum Reader', id: location.hostname },
      user: {
        id: randomBytes(16),
        name: 'forum-reader-vault',
        displayName: 'Forum Reader Vault'
      },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60_000,
      extensions: extensions as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential | null;

  if (!cred) return null;
  const credentialId = toB64Url(new Uint8Array(cred.rawId));
  const ext = cred.getClientExtensionResults() as PrfExtensionOutput;

  // Some platforms evaluate PRF during registration and hand back the value
  // here; many others (notably Chrome) only report `enabled` at create() time
  // and require a follow-up assertion to actually produce the secret. Support
  // both: use the create() result if present, otherwise evaluate it via get().
  let prfOutput = ext.prf?.results?.first;
  if (!prfOutput) {
    if (!ext.prf?.enabled) return null; // PRF genuinely unsupported here
    prfOutput = await getPrfOutput(credentialId, prfSalt);
  }

  return { credentialId, prfOutput };
}

/** Re-derive the PRF output for an existing credential (prompts biometrics). */
export async function getPrfOutput(
  credentialId: string,
  prfSalt: Uint8Array
): Promise<ArrayBuffer> {
  const extensions: PrfExtensionInput = { prf: { eval: { first: prfSalt } } };
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [
        { type: 'public-key', id: fromB64Url(credentialId) }
      ],
      userVerification: 'required',
      timeout: 60_000,
      extensions: extensions as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Biometric unlock was cancelled.');
  const ext = assertion.getClientExtensionResults() as PrfExtensionOutput;
  const prfOutput = ext.prf?.results?.first;
  if (!prfOutput) {
    throw new Error('This device did not return a PRF secret.');
  }
  return prfOutput;
}
