import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Modal } from '../components/Modal';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { updateForum, updateSettings } from '../db/db';
import type { ForumAccount } from '../db/types';
import { dropConnection, makeProbeClient } from '../forum/connection';
import { setActiveForumId } from '../lib/activeForum';
import { t } from '../lib/i18n';
import { reconnectSync } from '../lib/syncFile';
import { hostOf } from '../lib/url';
import { encryptSecrets } from '../lib/vault';
import { useForums } from '../hooks/useForums';
import { useSettings } from '../hooks/useSettings';
import { useSyncState } from '../hooks/useSync';

export function Forums() {
  const navigate = useNavigate();
  const forums = useForums();
  const settings = useSettings();
  const sync = useSyncState();
  const [needsPassword, setNeedsPassword] = useState<ForumAccount | null>(null);

  if (!forums || !settings) return <LoadingScreen />;

  const open = (id: number) => {
    const forum = forums.find((f) => f.id === id);
    if (forum && !forum.secrets) {
      setNeedsPassword(forum);
      return;
    }
    setActiveForumId(id);
    navigate(`/f/${id}`);
  };

  const toggleFavorite = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await updateSettings({
      favoriteForumId: settings.favoriteForumId === id ? null : id
    });
  };

  return (
    <div>
      <Header
        title={t('forums.title')}
        right={
          <button
            aria-label={t('forums.add')}
            onClick={() => navigate('/forums/add')}
            className="h-10 w-10 grid place-items-center rounded-full text-accent hover:bg-[rgb(var(--accent)/0.12)]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        }
      />

      {!settings.proxyBaseUrl && (
        <button
          onClick={() => navigate('/settings')}
          className="mx-auto block w-full max-w-4xl text-left"
        >
          <div className="m-4 rounded-xl border border-accent/40 bg-[rgb(var(--accent)/0.08)] p-4">
            <p className="text-sm font-medium text-ink">{t('forums.setupRelay')}</p>
            <p className="text-xs text-ink-dim mt-1">{t('forums.setupRelayHint')}</p>
          </div>
        </button>
      )}

      {sync.kind === 'needs-permission' && (
        <button onClick={() => reconnectSync()} className="mx-auto block w-full max-w-4xl text-left">
          <div className="m-4 rounded-xl border border-accent/40 bg-[rgb(var(--accent)/0.08)] p-4">
            <p className="text-sm font-medium text-ink">{t('sync.reconnectBanner')}</p>
            <p className="text-xs text-ink-dim mt-1">
              {t('sync.reconnectBannerHint', { file: sync.fileName })}
            </p>
          </div>
        </button>
      )}

      <div className="mx-auto max-w-4xl p-4">
        {forums.length === 0 ? (
          <div className="text-center py-16 text-ink-dim">
            <p className="font-medium text-ink">{t('forums.none')}</p>
            <p className="text-sm mt-1">{t('forums.noneHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {forums.map((f) => (
              <li key={f.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => open(f.id!)}
                  onKeyDown={(e) => e.key === 'Enter' && open(f.id!)}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 cursor-pointer hover:border-accent/50 transition-colors"
                >
                  <Avatar name={f.name} src={f.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{f.name}</p>
                    <p className="text-xs text-ink-dim truncate">
                      {hostOf(f.baseUrl)} · {f.username}
                      {!f.secrets && (
                        <span className="text-accent"> · {t('forums.passwordNeeded')}</span>
                      )}
                    </p>
                  </div>
                  <button
                    aria-label={
                      settings.favoriteForumId === f.id
                        ? t('forums.favUnset')
                        : t('forums.favSet')
                    }
                    onClick={(e) => toggleFavorite(e, f.id!)}
                    className="h-9 w-9 grid place-items-center rounded-full hover:bg-[rgb(var(--line)/0.6)]"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill={settings.favoriteForumId === f.id ? 'rgb(var(--accent))' : 'none'}
                      stroke={settings.favoriteForumId === f.id ? 'rgb(var(--accent))' : 'currentColor'}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={settings.favoriteForumId === f.id ? '' : 'text-ink-dim'}
                    >
                      <path d="M12 17.3l-6.16 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.48 4.73 1.64 7.03z" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PasswordModal
        forum={needsPassword}
        onClose={() => setNeedsPassword(null)}
        onSaved={(id) => {
          setNeedsPassword(null);
          setActiveForumId(id);
          navigate(`/f/${id}`);
        }}
      />
    </div>
  );
}

/** Enter the password for a forum that arrived via the sync file. */
function PasswordModal({
  forum,
  onClose,
  onSaved
}: {
  forum: ForumAccount | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const settings = useSettings();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!forum || !settings) return;
    setError(null);
    if (!settings.proxyBaseUrl) {
      setError(t('add.configureRelay'));
      return;
    }
    setBusy(true);
    try {
      const client = makeProbeClient(
        settings.proxyBaseUrl,
        settings.relayToken,
        forum.mobiquoUrl
      );
      const result = await client.login(forum.username, password);
      if (!result.success) {
        setError(result.error || t('add.loginFailed'));
        return;
      }
      await updateForum(forum.id!, { secrets: await encryptSecrets({ password }) });
      dropConnection(forum.id!);
      setPassword('');
      onSaved(forum.id!);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.couldNotConnectShort'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!forum} onClose={close} title={forum?.name}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-ink-dim">
          {t('forums.enterPassword', { user: forum?.username ?? '' })}
        </p>
        <Field
          label={t('add.password')}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-[rgb(255,107,107)]">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!password || busy}>
            {busy ? <Spinner /> : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
