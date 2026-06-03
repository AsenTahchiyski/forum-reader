import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { Pager } from '../components/Pager';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { cx } from '../lib/cx';
import { readListPosition, saveListPosition } from '../lib/scrollMemory';
import { formatWhen } from '../lib/time';
import { useAsync } from '../hooks/useAsync';

const PAGE_SIZE = 20;

export function TopicList() {
  const navigate = useNavigate();
  const { forumId, catId } = useParams();
  const title = (useLocation().state as { title?: string } | null)?.title;

  const memKey = `topics:${forumId}:${catId}`;

  // Restore the remembered page/scroll on a back-navigation remount.
  const [page, setPage] = useState(() => readListPosition(memKey)?.page ?? 0);
  const pageRef = useRef(page);
  pageRef.current = page;
  // Scroll offset to apply once this page's topics render (null once consumed).
  const pendingScroll = useRef<number | null>(
    readListPosition(memKey)?.scrollY ?? null
  );
  const firstParams = useRef(true);

  // Reset to the first page when the forum/sub-forum changes (same component
  // instance is reused across route param changes) — but not on the initial
  // mount, where we may be restoring a remembered position.
  useEffect(() => {
    if (firstParams.current) {
      firstParams.current = false;
      return;
    }
    pendingScroll.current = null;
    setPage(0);
  }, [forumId, catId]);

  // Continuously remember this list's position so back-navigation can restore
  // it. The unmount capture covers opening a topic without scrolling first.
  useEffect(() => {
    let raf = 0;
    const remember = () =>
      saveListPosition(memKey, { page: pageRef.current, scrollY: window.scrollY });
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        remember();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      remember();
    };
  }, [memKey]);

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

  // Once the (possibly remembered) page's topics are in, restore the saved
  // scroll offset instead of staying at the top.
  useEffect(() => {
    if (!data || pendingScroll.current == null) return;
    window.scrollTo({ top: pendingScroll.current });
    pendingScroll.current = null;
  }, [data]);

  // Scroll to the top on a manual page change, unless a restore is pending.
  useEffect(() => {
    if (pendingScroll.current != null) return;
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
          <ul className="space-y-2">
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
                  <span className="mt-0.5 shrink-0">
                    {t.hasNew ? (
                      <span
                        className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-contrast"
                        aria-label="Unread"
                        title="Unread"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>
                      </span>
                    ) : (
                      <span
                        className="grid h-5 w-5 place-items-center rounded-full border border-line text-ink-dim"
                        aria-label="Read"
                        title="Read"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {t.isSticky && <Badge>Pinned</Badge>}
                      {t.isLocked && <Badge>Locked</Badge>}
                      <span className={cx('line-clamp-2', t.hasNew ? 'font-semibold' : 'font-normal text-ink-dim')}>{t.title}</span>
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

          {/* Clear space behind the docked pager so the last row stays visible. */}
          {pageCount > 1 && <div aria-hidden className="h-14" />}
          <Pager dock page={page} pageCount={pageCount} onChange={setPage} disabled={loading} />
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
