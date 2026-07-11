import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Modal } from '../components/Modal';
import { LoadingScreen } from '../components/Spinner';
import { deleteForum, updateSettings } from '../db/db';
import type { ThemeMode } from '../db/types';
import { dropAllConnections, dropConnection } from '../forum/connection';
import { PRESET_ACCENTS } from '../lib/color';
import { cx } from '../lib/cx';
import { hostOf } from '../lib/url';
import { resetVault } from '../lib/vault';
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

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (settings) {
      setProxyUrl(settings.proxyBaseUrl);
      setRelayToken(settings.relayToken);
    }
  }, [settings?.proxyBaseUrl, settings?.relayToken]);

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
            Logins are stored on this device and open without a prompt, like
            Tapatalk. Anyone with access to this browser profile can use them.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              Erase all logins
            </Button>
          </div>
        </Section>

        <p className="text-center text-xs text-ink-dim pb-4">
          Forum Reader · credentials are stored on this device only.
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

      {/* Confirm: erase all logins */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Erase all logins?">
        <p className="text-sm text-ink-dim">
          This deletes <strong>all saved forums and logins</strong> from this
          device. This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onReset}>
            Erase everything
          </Button>
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
