import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import type { Topic } from '../forum/types';
import { formatWhen } from '../lib/time';
import { usePaged } from '../hooks/usePaged';

export function TopicList() {
  const navigate = useNavigate();
  const { forumId, catId } = useParams();
  const title = (useLocation().state as { title?: string } | null)?.title;

  const load = useCallback(
    (start: number, end: number) =>
      getClient(Number(forumId)).then((c) => c.getTopics(catId!, start, end)),
    [forumId, catId]
  );

  const { items, loading, error, done, loadMore, reload } = usePaged<Topic>(
    load,
    [forumId, catId]
  );

  return (
    <div>
      <Header title={title || 'Topics'} subtitle={`${items.length || ''}`} back busy={loading && items.length > 0} />
      {error && items.length === 0 && <ErrorBanner message={error} onRetry={reload} />}
      {loading && items.length === 0 && <LoadingScreen label="Loading topics…" />}

      <div className="mx-auto max-w-2xl p-4">
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id}>
              <button
                onClick={() =>
                  navigate(`/f/${forumId}/t/${t.id}`, { state: { title: t.title } })
                }
                className="w-full flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent/50 transition-colors"
              >
                <span className="mt-1 shrink-0">
                  {t.hasNew ? (
                    <span className="block h-2.5 w-2.5 rounded-full bg-accent" aria-label="New posts" />
                  ) : (
                    <span className="block h-2.5 w-2.5 rounded-full border border-line" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {t.isSticky && <Badge>Pinned</Badge>}
                    {t.isLocked && <Badge>Locked</Badge>}
                    <span className="font-medium line-clamp-2">{t.title}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-dim truncate">
                    {t.author}
                    {t.lastReplyAt ? ` · ${formatWhen(t.lastReplyAt)}` : ''}
                    {` · ${t.replyCount} replies`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error && items.length > 0 && (
          <p className="text-center text-sm text-[rgb(255,107,107)] py-3">{error}</p>
        )}

        {!done && items.length > 0 && (
          <div className="py-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loading}>
              {loading ? <Spinner /> : 'Load more'}
            </Button>
          </div>
        )}
        {done && items.length === 0 && !loading && (
          <p className="text-center text-ink-dim py-10 text-sm">No topics here.</p>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-[rgb(var(--accent)/0.14)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      {children}
    </span>
  );
}
