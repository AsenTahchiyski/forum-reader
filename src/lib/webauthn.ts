/**
 * WebAuthn helper for the legacy biometric unlock (PRF extension).
 *
 * Only the assertion path remains: it re-derives the secret that unwraps a
 * legacy locked vault's DEK so the vault can be converted to no-lock startup.
 * New vaults never register a passkey.
 */
import { fromB64Url, randomBytes } from './crypto';

// The PRF extension isn't in the standard TS DOM lib yet; describe what we use.
interface PrfExtensionInput {
  prf?: { eval?: { first: BufferSource } };
}
interface PrfExtensionOutput {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
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
