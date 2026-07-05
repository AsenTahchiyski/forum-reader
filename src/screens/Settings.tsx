import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Modal } from '../components/Modal';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { deleteForum, updateSettings } from '../db/db';
import type { ThemeMode } from '../db/types';
import { dropAllConnections, dropConnection } from '../forum/connection';
import { PRESET_ACCENTS } from '../lib/color';
import { cx } from '../lib/cx';
import { hostOf } from '../lib/url';
import {
  addPassphraseFallback,
  hasPassphraseUnlock,
  lock,
  resetVault,
  vaultMethod
} from '../lib/vault';
import { useForums } from '../hooks/useForums';
import { useSettings } from '../hooks/useSettings';

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
];

export function Settings() {
  const navigate = useNavigate();
  const settings = useSettings();
  const forums = useForums();

  const [proxyUrl, setProxyUrl] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [relaySaved, setRelaySaved] = useState(false);

  const [method, setMethod] = useState<string | null>(null);
  const [hasPass, setHasPass] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [passModal, setPassModal] = useState(false);
  const [pass, setPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passBusy, setPassBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setProxyUrl(settings.proxyBaseUrl);
      setRelayToken(settings.relayToken);
    }
  }, [settings?.proxyBaseUrl, settings?.relayToken]);

  useEffect(() => {
    (async () => {
      setMethod(await vaultMethod());
      setHasPass(await hasPassphraseUnlock());
    })();
  }, []);

  if (!settings || !forums) return <LoadingScreen />;

  const saveRelay = async () => {
    await updateSettings({
      proxyBaseUrl: proxyUrl.trim().replace(/\/+$/, ''),
      relayToken: relayToken.trim()
    });
    dropAllConnections(); // force re-login with new relay settings
    setRelaySaved(true);
    setTimeout(() => setRelaySaved(false), 2000);
  };

  const onDeleteForum = async () => {
    if (!confirmDelete) return;
    await deleteForum(confirmDelete.id);
    dropConnection(confirmDelete.id);
    setConfirmDelete(null);
  };

  const onReset = async () => {
    await resetVault();
    dropAllConnections();
    setConfirmReset(false);
    // Vault is now locked with no record → App shows first-run setup.
  };

  const onAddPassphrase = async () => {
    setPassError(null);
    if (pass.length < 6) return setPassError('Use at least 6 characters.');
    if (pass !== passConfirm) return setPassError('Passphrases do not match.');
    setPassBusy(true);
    try {
      await addPassphraseFallback(pass);
      setHasPass(true);
      setPassModal(false);
      setPass('');
      setPassConfirm('');
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setPassBusy(false);
    }
  };

  const lockNow = () => {
    lock();
    navigate('/');
  };

  return (
    <div>
      <Header title="Settings" />
      <div className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Appearance */}
        <Section title="Appearance">
          <Row label="Theme">
            <div className="flex rounded-xl border border-line overflow-hidden">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateSettings({ themeMode: opt.id })}
                  className={cx(
                    'px-3 h-9 text-sm font-medium',
                    settings.themeMode === opt.id
                      ? 'bg-accent text-accent-contrast'
                      : 'text-ink-dim hover:bg-[rgb(var(--line)/0.5)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Accent">
            <div className="flex flex-wrap gap-2 justify-end">
              {PRESET_ACCENTS.map((c) => (
                <button
                  key={c}
                  aria-label={`Accent ${c}`}
                  onClick={() => updateSettings({ accentColor: c })}
                  style={{ backgroundColor: c }}
                  className={cx(
                    'h-7 w-7 rounded-full border-2 transition-transform',
                    settings.accentColor === c
                      ? 'border-ink scale-110'
                      : 'border-transparent'
                  )}
                />
              ))}
            </div>
          </Row>
          <Row label="Show images & videos" hint="Render media inline in posts.">
            <Toggle
              on={settings.showMedia}
              onChange={(v) => updateSettings({ showMedia: v })}
            />
          </Row>
        </Section>

        {/* Default forum */}
        <Section title="Default forum" subtitle="Opened automatically when the app launches.">
          <select
            value={settings.favoriteForumId ?? ''}
            onChange={(e) =>
              updateSettings({
                favoriteForumId: e.target.value ? Number(e.target.value) : null
              })
            }
            className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-line focus:outline-none focus:border-accent"
          >
            <option value="">No default (show forum list)</option>
            {forums.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Section>

        {/* Relay */}
        <Section
          title="Relay"
          subtitle="Forum Reader reaches forums through a small relay you host yourself. See proxy/README.md in the project for setup."
        >
          <Field
            label="Relay URL"
            placeholder="https://forum-relay.you.workers.dev"
            inputMode="url"
            autoCapitalize="none"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
          />
          <Field
            label="Relay token"
            type="password"
            placeholder="Your RELAY_TOKEN secret"
            value={relayToken}
            onChange={(e) => setRelayToken(e.target.value)}
          />
          <Button onClick={saveRelay} variant="outline" size="sm">
            {relaySaved ? 'Saved ✓' : 'Save relay settings'}
          </Button>
        </Section>

        {/* Forums */}
        <Section title="Forums">
          {forums.length === 0 ? (
            <p className="text-sm text-ink-dim">No forums added.</p>
          ) : (
            <ul className="divide-y divide-line">
              {forums.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{f.name}</p>
                    <p className="text-xs text-ink-dim truncate">{hostOf(f.baseUrl)}</p>
                  </div>
                  <button
                    onClick={() => setConfirmDelete({ id: f.id!, name: f.name })}
                    className="text-sm text-[rgb(255,107,107)] px-2 py-1"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate('/forums/add')}>
            Add a forum
          </Button>
        </Section>

        {/* Security */}
        <Section title="Security">
          <p className="text-sm text-ink-dim">
            Unlock method: <span className="text-ink font-medium">{method === 'webauthn' ? 'Biometrics' : method === 'passphrase' ? 'Passphrase' : '—'}</span>
            {method === 'webauthn' && (hasPass ? ' (passphrase recovery set)' : ' (no recovery set)')}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={lockNow}>
              Lock now
            </Button>
            {method === 'webauthn' && !hasPass && (
              <Button variant="ghost" size="sm" onClick={() => setPassModal(true)}>
                Add passphrase recovery
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              Reset vault
            </Button>
          </div>
        </Section>

        <p className="text-center text-xs text-ink-dim pb-4">
          Forum Reader · credentials are encrypted on this device only.
        </p>
      </div>

      {/* Confirm: delete forum */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove forum?">
        <p className="text-sm text-ink-dim">
          Remove <span className="text-ink font-medium">{confirmDelete?.name}</span> and its
          saved login from this device?
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onDeleteForum}>
            Remove
          </Button>
        </div>
      </Modal>

      {/* Confirm: reset vault */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset vault?">
        <p className="text-sm text-ink-dim">
          This deletes the vault and <strong>all saved forums and logins</strong> from this
          device. You'll set up a new vault next. This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onReset}>
            Reset everything
          </Button>
        </div>
      </Modal>

      {/* Add passphrase recovery */}
      <Modal open={passModal} onClose={() => setPassModal(false)} title="Passphrase recovery">
        <p className="text-sm text-ink-dim mb-3">
          Set a passphrase you can use if biometrics ever become unavailable.
        </p>
        <div className="space-y-3">
          <Field type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Field type="password" placeholder="Confirm" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} />
          {passError && <p className="text-sm text-[rgb(255,107,107)]">{passError}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPassModal(false)} disabled={passBusy}>
              Cancel
            </Button>
            <Button size="sm" onClick={onAddPassphrase} disabled={passBusy}>
              {passBusy ? <Spinner /> : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface-2 p-4">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-ink-dim mt-0.5 mb-3">{subtitle}</p>}
      <div className={subtitle ? 'space-y-3' : 'space-y-3 mt-3'}>{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-ink-dim">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        'relative h-7 w-12 rounded-full transition-colors shrink-0',
        on ? 'bg-accent' : 'bg-line'
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
