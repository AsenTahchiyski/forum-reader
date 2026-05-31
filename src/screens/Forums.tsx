import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/Spinner';
import { updateSettings } from '../db/db';
import { setActiveForumId } from '../lib/activeForum';
import { hostOf } from '../lib/url';
import { useForums } from '../hooks/useForums';
import { useSettings } from '../hooks/useSettings';

export function Forums() {
  const navigate = useNavigate();
  const forums = useForums();
  const settings = useSettings();

  if (!forums || !settings) return <LoadingScreen />;

  const open = (id: number) => {
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
        title="Forums"
        right={
          <button
            aria-label="Add forum"
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
          className="mx-auto block w-full max-w-2xl text-left"
        >
          <div className="m-4 rounded-xl border border-accent/40 bg-[rgb(var(--accent)/0.08)] p-4">
            <p className="text-sm font-medium text-ink">Set up your relay first</p>
            <p className="text-xs text-ink-dim mt-1">
              Forum Reader needs a small self-hosted relay to reach forums. Tap to
              configure it in Settings.
            </p>
          </div>
        </button>
      )}

      <div className="mx-auto max-w-2xl p-4">
        {forums.length === 0 ? (
          <div className="text-center py-16 text-ink-dim">
            <p className="font-medium text-ink">No forums yet</p>
            <p className="text-sm mt-1">
              Add a phpBB forum that has the Tapatalk plugin to get started.
            </p>
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
                    </p>
                  </div>
                  <button
                    aria-label={
                      settings.favoriteForumId === f.id
                        ? 'Unset favorite'
                        : 'Set as favorite'
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
    </div>
  );
}
