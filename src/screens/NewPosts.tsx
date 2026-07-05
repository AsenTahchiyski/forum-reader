import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { formatWhen } from '../lib/time';
import { usePaged } from '../hooks/usePaged';

export function NewPosts() {
  const navigate = useNavigate();
  const forumId = Number(useParams().forumId);

  const { items, loading, error, done, loadMore, reload } = usePaged(
    async (start, end) => {
      const client = await getClient(forumId);
      const { topics } = await client.getUnreadTopics(start, end);
      return topics;
    },
    [forumId]
  );

  return (
    <div>
      <Header title="New posts" back busy={loading && items.length > 0} />
      {error && items.length === 0 && <ErrorBanner message={error} onRetry={reload} />}
      {loading && items.length === 0 && <LoadingScreen label="Loading new posts…" />}

      {(items.length > 0 || done) && (
        <div className="mx-auto max-w-4xl p-4">
          {items.length === 0 ? (
            <p className="text-center text-ink-dim py-16 text-sm">
              You're all caught up — no unread topics.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() =>
                      navigate(`/f/${forumId}/t/${t.id}`, {
                        state: {
                          title: t.title,
                          hasNew: true,
                          replyCount: t.replyCount,
                          unreadPosition: t.unreadPosition
                        }
                      })
                    }
                    className="w-full flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent/50 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-contrast">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold line-clamp-2">{t.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-dim truncate">
                        {t.forumName ? `${t.forumName} · ` : ''}
                        {t.author}
                        {t.lastReplyAt ? ` · ${formatWhen(t.lastReplyAt)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && items.length > 0 && (
            <p className="text-center text-sm text-[rgb(255,107,107)] mt-3">{error}</p>
          )}

          {!done && items.length > 0 && (
            <div className="mt-4">
              <Button full variant="outline" onClick={loadMore} disabled={loading}>
                {loading ? <Spinner /> : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
