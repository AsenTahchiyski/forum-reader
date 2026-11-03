import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Modal } from '../components/Modal';
import { LoadingScreen } from '../components/Spinner';
import { deleteForum, updateForum, updateSettings } from '../db/db';
import type { ForumAccount, ThemeMode } from '../db/types';
import { dropAllConnections, dropConnection } from '../forum/connection';
import { PRESET_ACCENTS } from '../lib/color';
import { cx } from '../lib/cx';
import { defaultLang, t, type Lang, type MsgKey } from '../lib/i18n';
import {
  clearSyncNotice,
  createSyncFile,
  disconnectSync,
  exportConfig,
  importConfig,
  liveSyncSupported,
  openSyncFile,
  reconnectSync,
  syncNow
} from '../lib/syncFile';
import { formatEpoch } from '../lib/time';
import { hostOf } from '../lib/url';
import { resetVault } from '../lib/vault';
import { useForums } from '../hooks/useForums';
import { useSettings } from '../hooks/useSettings';
import { useSyncNotice, useSyncState } from '../hooks/useSync';

const THEME_OPTIONS: { id: ThemeMode; label: MsgKey }[] = [
  { id: 'system', label: 'settings.themeSystem' },
  { id: 'light', label: 'settings.themeLight' },
  { id: 'dark', label: 'settings.themeDark' }
];

// Language names are shown in their own language, so no t() here.
const LANG_OPTIONS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'bg', label: 'Български' }
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
  const [blockedForumId, setBlockedForumId] = useState<number | null>(null);

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
    // Erasing this device shouldn't wipe the shared sync file too.
    await disconnectSync();
    await resetVault();
    dropAllConnections();
    setConfirmReset(false);
    navigate('/');
  };

  return (
    <div>
      <Header title={t('settings.title')} />
      <div className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Appearance */}
        <Section title={t('settings.appearance')}>
          <Row label={t('settings.theme')}>
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
                  {t(opt.label)}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t('settings.language')}>
            <div className="flex rounded-xl border border-line overflow-hidden">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateSettings({ language: opt.id })}
                  className={cx(
                    'px-3 h-9 text-sm font-medium',
                    (settings.language ?? defaultLang()) === opt.id
                      ? 'bg-accent text-accent-contrast'
                      : 'text-ink-dim hover:bg-[rgb(var(--line)/0.5)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t('settings.accent')}>
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
          <Row label={t('settings.showMedia')} hint={t('settings.showMediaHint')}>
            <Toggle
              on={settings.showMedia}
              onChange={(v) => updateSettings({ showMedia: v })}
            />
          </Row>
          <Row label={t('settings.readingScale')} hint={t('settings.readingScaleHint')}>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="range"
                min={0.8}
                max={1.6}
                step={0.1}
                value={settings.readingScale ?? 1}
                onChange={(e) =>
                  updateSettings({ readingScale: Number(e.target.value) })
                }
                className="w-32 accent-accent"
                aria-label={t('settings.readingScale')}
              />
              <span className="text-sm tabular-nums text-ink-dim w-10 text-right">
                {Math.round((settings.readingScale ?? 1) * 100)}%
              </span>
            </div>
          </Row>
        </Section>

        {/* Default forum */}
        <Section title={t('settings.defaultForum')} subtitle={t('settings.defaultForumHint')}>
          <select
            value={settings.favoriteForumId ?? ''}
            onChange={(e) =>
              updateSettings({
                favoriteForumId: e.target.value ? Number(e.target.value) : null
              })
            }
            className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-line focus:outline-none focus:border-accent"
          >
            <option value="">{t('settings.noDefault')}</option>
            {forums.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Section>

        {/* Relay */}
        <Section title={t('settings.relay')} subtitle={t('settings.relayHint')}>
          <Field
            label={t('settings.relayUrl')}
            placeholder="https://forum-relay.you.workers.dev"
            inputMode="url"
            autoCapitalize="none"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
          />
          <Field
            label={t('settings.relayToken')}
            type="password"
            placeholder={t('settings.relayTokenPlaceholder')}
            value={relayToken}
            onChange={(e) => setRelayToken(e.target.value)}
          />
          <Button onClick={saveRelay} variant="outline" size="sm">
            {relaySaved ? t('settings.saved') : t('settings.saveRelay')}
          </Button>
        </Section>

        {/* Forums */}
        <Section title={t('settings.forums')}>
          {forums.length === 0 ? (
            <p className="text-sm text-ink-dim">{t('settings.noForums')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {forums.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{f.name}</p>
                    <p className="text-xs text-ink-dim truncate">{hostOf(f.baseUrl)}</p>
                  </div>
                  <button
                    onClick={() => setBlockedForumId(f.id!)}
                    className="text-sm text-ink-dim px-2 py-1"
                  >
                    {f.blockedUsers?.length
                      ? t('settings.blockedCount', { n: f.blockedUsers.length })
                      : t('settings.blocked')}
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: f.id!, name: f.name })}
                    className="text-sm text-[rgb(255,107,107)] px-2 py-1"
                  >
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate('/forums/add')}>
            {t('settings.addForum')}
          </Button>
        </Section>

        <SyncSection />

        {/* Security */}
        <Section title={t('settings.security')}>
          <p className="text-sm text-ink-dim">{t('settings.securityNote')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              {t('settings.eraseAll')}
            </Button>
          </div>
        </Section>

        <p className="text-center text-xs text-ink-dim pb-4">{t('settings.footer')}</p>
      </div>

      <BlockedModal
        forum={forums.find((f) => f.id === blockedForumId) ?? null}
        onClose={() => setBlockedForumId(null)}
      />

      {/* Confirm: delete forum */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('settings.removeForumTitle')}
      >
        <p className="text-sm text-ink-dim">
          {t('settings.removeForumQ1')}{' '}
          <span className="text-ink font-medium">{confirmDelete?.name}</span>{' '}
          {t('settings.removeForumQ2')}
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onDeleteForum}>
            {t('common.remove')}
          </Button>
        </div>
      </Modal>

      {/* Confirm: erase all logins */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t('settings.eraseTitle')}
      >
        <p className="text-sm text-ink-dim">
          {t('settings.erase1')} <strong>{t('settings.erase2')}</strong> {t('settings.erase3')}
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onReset}>
            {t('settings.eraseConfirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Per-forum list of usernames whose posts are hidden in threads. */
function BlockedModal({ forum, onClose }: { forum: ForumAccount | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const blocked = forum?.blockedUsers ?? [];

  const save = (list: string[]) => updateForum(forum!.id!, { blockedUsers: list });

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (!blocked.some((b) => b.toLowerCase() === n.toLowerCase())) await save([...blocked, n]);
    setName('');
  };

  const close = () => {
    setName('');
    onClose();
  };

  return (
    <Modal open={!!forum} onClose={close} title={t('settings.blocked')}>
      <p className="text-sm text-ink-dim">{t('settings.blockedHint')}</p>
      <form
        className="flex items-center gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex-1 min-w-0">
          <Field
            placeholder={t('settings.blockedPlaceholder')}
            autoCapitalize="none"
            autoCorrect="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" className="shrink-0" disabled={!name.trim()}>
          {t('settings.blockedAdd')}
        </Button>
      </form>
      {blocked.length === 0 ? (
        <p className="text-sm text-ink-dim mt-3">{t('settings.blockedNone')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2 mt-3">
          {blocked.map((b) => (
            <li
              key={b}
              className="flex items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 h-8 text-sm"
            >
              <span className="truncate max-w-[12rem]">{b}</span>
              <button
                aria-label={t('settings.unblock', { name: b })}
                onClick={() => save(blocked.filter((x) => x !== b))}
                className="h-6 w-6 grid place-items-center rounded-full text-ink-dim hover:bg-[rgb(var(--line)/0.6)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={close}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  );
}

function SyncSection() {
  const sync = useSyncState();
  const notice = useSyncNotice();
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<void>) => async () => {
    setError(null);
    clearSyncNotice();
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(() => importConfig(file))();
    setImported(true);
    setTimeout(() => setImported(false), 2000);
  };

  return (
    <Section title={t('sync.title')} subtitle={t('sync.hint')}>
      {liveSyncSupported ? (
        sync.kind === 'off' ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={run(createSyncFile)}>
              {t('sync.create')}
            </Button>
            <Button variant="outline" size="sm" onClick={run(openSyncFile)}>
              {t('sync.open')}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{sync.fileName}</span>
              <span className="text-ink-dim">
                {' · '}
                {sync.kind === 'connected'
                  ? sync.lastSyncAt
                    ? t('sync.syncedAt', { when: formatEpoch(sync.lastSyncAt / 1000) })
                    : t('sync.connected')
                  : sync.kind === 'needs-permission'
                    ? t('sync.needsPermission')
                    : sync.message}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {sync.kind === 'connected' ? (
                <Button variant="outline" size="sm" onClick={run(syncNow)}>
                  {t('sync.syncNow')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={run(reconnectSync)}>
                  {t('sync.reconnect')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={run(disconnectSync)}>
                {t('sync.disconnect')}
              </Button>
            </div>
          </>
        )
      ) : (
        <p className="text-sm text-ink-dim">{t('sync.unsupported')}</p>
      )}
      {notice && <p className="text-sm text-accent">{notice}</p>}
      {error && <p className="text-sm text-[rgb(255,107,107)]">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={run(exportConfig)}>
          {t('sync.export')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>
          {imported ? t('settings.saved') : t('sync.import')}
        </Button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onImport}
        />
      </div>
    </Section>
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
