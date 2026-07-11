import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Spinner } from '../components/Spinner';
import {
  hasPassphraseUnlock,
  unlockWithBiometric,
  unlockWithPassphrase,
  vaultMethod
} from '../lib/vault';

/**
 * One-time unlock for vaults created back when the app had a startup lock.
 * The stored key can't be decrypted without the original passphrase or
 * biometric, so it is asked for once more; on success the vault is converted
 * to no-lock and this screen never appears again.
 */
export function Lock() {
  const [method, setMethod] = useState<string | null>(null);
  const [hasPass, setHasPass] = useState(false);
  const [ready, setReady] = useState(false);

  const [mode, setMode] = useState<'choose' | 'passphrase'>('choose');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setMethod(await vaultMethod());
      setHasPass(await hasPassphraseUnlock());
      setReady(true);
    })();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      // On success the vault emits "unlocked" and App swaps to the app routes.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner className="text-accent h-7 w-7" />
      </div>
    );
  }

  const showBioUnlock = method === 'webauthn';

  return (
    <div className="accent-ambient min-h-dvh flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-[rgb(var(--accent)/0.15)] grid place-items-center mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Forum Reader</h1>
          <p className="text-ink-dim text-sm mt-1.5">
            One last unlock: startup locking has been removed, so after this
            your logins open without a prompt.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-[rgb(255_107_107/0.3)] bg-[rgb(255_107_107/0.1)] p-3 text-sm text-[rgb(255,107,107)]">
            {error}
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            {showBioUnlock && (
              <Button full size="lg" disabled={busy} onClick={() => run(unlockWithBiometric)}>
                {busy ? <Spinner /> : 'Unlock with biometrics'}
              </Button>
            )}
            {(method === 'passphrase' || hasPass) && (
              <Button
                full
                size="lg"
                variant={showBioUnlock ? 'outline' : 'primary'}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setMode('passphrase');
                }}
              >
                Use passphrase
              </Button>
            )}
          </div>
        )}

        {mode === 'passphrase' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => unlockWithPassphrase(pass));
            }}
          >
            <Field
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <Button full size="lg" type="submit" disabled={busy || !pass}>
              {busy ? <Spinner /> : 'Unlock'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-ink-dim py-2"
              onClick={() => {
                setError(null);
                setMode('choose');
              }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
