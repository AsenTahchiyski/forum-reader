import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { Pager } from '../components/Pager';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { formatWhen } from '../lib/time';
import { useAsync } from '../hooks/useAsync';

const PAGE_SIZE = 20;

export function TopicList() {
  const navigate = useNavigate();
  const { forumId, catId } = useParams();
  const title = (useLocation().state as { title?: string } | null)?.title;

  const [page, setPage] = useState(0);

  // Reset to the first page when the forum/sub-forum changes (same component
  // instance is reused across route param changes).
  useEffect(() => {
    setPage(0);
  }, [forumId, catId]);

  const { data, loading, error, reload } = useAsync(
    async () => {
      const client = await getClient(Number(forumId));
      return client.getTopics(catId!, page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    },
    [forumId, catId, page]
  );

  const topics = data?.topics ?? [];
  const total = data?.total ?? 0;
  const fullPage = topics.length >= PAGE_SIZE;
  // Use the real total when the plugin reports it; otherwise infer whether a
  // next page likely exists from whether this page came back full.
  const pageCount =
    total > 0
      ? Math.max(1, Math.ceil(total / PAGE_SIZE))
      : fullPage
        ? page + 2
        : page + 1;

  useEffect(() => {
    if (total > 0 && page > pageCount - 1) setPage(pageCount - 1);
  }, [total, page, pageCount]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div>
      <Header
        title={title || 'Topics'}
        subtitle={total > 0 ? `${total} topics` : undefined}
        back
        busy={loading && topics.length > 0}
      />
      {error && !data && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading topics…" />}

      {data && (
        <div className="mx-auto max-w-2xl p-4">
          <Pager page={page} pageCount={pageCount} onChange={setPage} disabled={loading} />

          <ul className="space-y-2 mt-3">
            {topics.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() =>
                    navigate(`/f/${forumId}/t/${t.id}`, {
                      state: {
                        title: t.title,
                        hasNew: t.hasNew,
                        replyCount: t.replyCount,
                        unreadPosition: t.unreadPosition
                      }
                    })
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

          {error && topics.length > 0 && (
            <p className="text-center text-sm text-[rgb(255,107,107)] mt-3">{error}</p>
          )}

          {topics.length === 0 && !loading && (
            <p className="text-center text-ink-dim py-10 text-sm">No topics here.</p>
          )}

          <div className="mt-4">
            <Pager page={page} pageCount={pageCount} onChange={setPage} disabled={loading} />
          </div>
        </div>
      )}
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
