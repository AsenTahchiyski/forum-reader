import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { setActiveForumId } from '../lib/activeForum';
import { useAsync } from '../hooks/useAsync';
import { useForum } from '../hooks/useForums';

export function Messages() {
  const navigate = useNavigate();
  const forumId = Number(useParams().forumId);
  const forum = useForum(Number.isNaN(forumId) ? null : forumId);

  if (!Number.isNaN(forumId)) setActiveForumId(forumId);

  const { data, loading, error, reload } = useAsync(
    () => getClient(forumId).then((c) => c.getBoxes()),
    [forumId]
  );

  return (
    <div>
      <Header
        title="Messages"
        subtitle={forum?.name}
        back
        busy={loading}
        right={
          <button
            aria-label="New message"
            onClick={() => navigate(`/f/${forumId}/compose`)}
            className="h-10 w-10 grid place-items-center rounded-full text-accent hover:bg-[rgb(var(--accent)/0.12)]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading messages…" />}
      {data && (
        <div className="mx-auto max-w-2xl p-4">
          {data.length === 0 ? (
            <p className="text-center text-ink-dim py-10 text-sm">
              No message folders available.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.map((box) => (
                <li key={box.id}>
                  <button
                    onClick={() =>
                      navigate(`/f/${forumId}/pm/${box.id}`, {
                        state: { title: box.title }
                      })
                    }
                    className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3.5 text-left hover:border-accent/50 transition-colors"
                  >
                    <span className="h-9 w-9 grid place-items-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-accent shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M4 8l8 5 8-5" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{box.title}</span>
                      <span className="block text-xs text-ink-dim">{box.total} messages</span>
                    </span>
                    {box.unreadCount > 0 && (
                      <span className="rounded-full bg-accent text-accent-contrast text-xs font-semibold px-2 py-0.5">
                        {box.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
