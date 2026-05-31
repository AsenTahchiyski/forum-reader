import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Spinner } from '../components/Spinner';
import {
  hasPassphraseUnlock,
  setupWithBiometric,
  setupWithPassphrase,
  unlockWithBiometric,
  unlockWithPassphrase,
  vaultMethod
} from '../lib/vault';
import { isBiometricAvailable } from '../lib/webauthn';
import type { UnlockMethod } from '../db/types';

interface Props {
  /** True when a vault already exists (unlock); false for first-run setup. */
  existing: boolean;
}

export function Lock({ existing }: Props) {
  const [bioAvailable, setBioAvailable] = useState(false);
  const [method, setMethod] = useState<UnlockMethod | null>(null);
  const [hasPass, setHasPass] = useState(false);
  const [ready, setReady] = useState(false);

  const [mode, setMode] = useState<'choose' | 'passphrase'>('choose');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setBioAvailable(await isBiometricAvailable());
      if (existing) {
        setMethod(await vaultMethod());
        setHasPass(await hasPassphraseUnlock());
      }
      setReady(true);
    })();
  }, [existing]);

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

  const submitPassphrase = () => {
    if (existing) return run(() => unlockWithPassphrase(pass));
    if (pass.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (pass !== confirm) {
      setError('Passphrases do not match.');
      return;
    }
    return run(() => setupWithPassphrase(pass));
  };

  if (!ready) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner className="text-accent h-7 w-7" />
      </div>
    );
  }

  const showBioUnlock = existing && method === 'webauthn';
  const showPassUnlock = existing && (method === 'passphrase' || hasPass);

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
            {existing
              ? 'Unlock your encrypted forum vault.'
              : 'Secure your forum logins. They are encrypted on this device and never leave it except to your own relay.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-[rgb(255_107_107/0.3)] bg-[rgb(255_107_107/0.1)] p-3 text-sm text-[rgb(255,107,107)]">
            {error}
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            {/* Unlock (existing vault) */}
            {showBioUnlock && (
              <Button full size="lg" disabled={busy} onClick={() => run(unlockWithBiometric)}>
                {busy ? <Spinner /> : 'Unlock with biometrics'}
              </Button>
            )}
            {showPassUnlock && (
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

            {/* Setup (first run) */}
            {!existing && (
              <>
                {bioAvailable && (
                  <Button full size="lg" disabled={busy} onClick={() => run(setupWithBiometric)}>
                    {busy ? <Spinner /> : 'Set up biometric unlock'}
                  </Button>
                )}
                <Button
                  full
                  size="lg"
                  variant={bioAvailable ? 'outline' : 'primary'}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setMode('passphrase');
                  }}
                >
                  {bioAvailable ? 'Use a passphrase instead' : 'Set a passphrase'}
                </Button>
                {!bioAvailable && (
                  <p className="text-xs text-ink-dim text-center pt-1">
                    Biometric unlock isn’t available on this device or browser.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'passphrase' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitPassphrase();
            }}
          >
            <Field
              type="password"
              autoFocus
              autoComplete={existing ? 'current-password' : 'new-password'}
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            {!existing && (
              <Field
                type="password"
                autoComplete="new-password"
                placeholder="Confirm passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            <Button full size="lg" type="submit" disabled={busy || !pass}>
              {busy ? <Spinner /> : existing ? 'Unlock' : 'Create vault'}
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
