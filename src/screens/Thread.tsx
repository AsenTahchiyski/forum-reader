import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { TextArea } from '../components/Field';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { Pager } from '../components/Pager';
import { getClient } from '../forum/connection';
import { PostContent } from '../lib/bbcode';
import { formatWhen } from '../lib/time';
import { useAsync } from '../hooks/useAsync';
import { useSettings } from '../hooks/useSettings';

const PAGE_SIZE = 20;

interface NavState {
  title?: string;
  hasNew?: boolean;
  replyCount?: number;
  unreadPosition?: number;
}

export function Thread() {
  const { forumId, topicId } = useParams();
  const accountId = Number(forumId);
  const st = (useLocation().state as NavState | null) ?? {};
  const settings = useSettings();

  // Best estimate of total posts before the first response: replies + opening post.
  const estTotal = st.replyCount != null ? st.replyCount + 1 : null;

  // Where to start: the first unread post if the plugin told us, else the last
  // page when there are new posts, else the top.
  const [page, setPage] = useState<number>(() => {
    if (st.unreadPosition && st.unreadPosition > 0) {
      return Math.floor((st.unreadPosition - 1) / PAGE_SIZE);
    }
    if (st.hasNew && estTotal) return Math.floor((estTotal - 1) / PAGE_SIZE);
    return 0;
  });

  // The 1-based number of the first unread post, if the plugin told us. We
  // land on it directly (scrolling past the read posts that share its page)
  // once that page's posts have loaded, then clear it so later page changes
  // jump to the top as usual.
  const pendingUnread = useRef<number | null>(
    st.unreadPosition && st.unreadPosition > 0 ? st.unreadPosition : null
  );

  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(
    async () => {
      const client = await getClient(accountId);
      return client.getThread(topicId!, page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    },
    [accountId, topicId, page]
  );

  const total =
    data && data.totalPosts > 0
      ? data.totalPosts
      : (estTotal ?? page * PAGE_SIZE + (data?.posts.length || 0));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If our estimate overshot the real page count, clamp once the truth arrives.
  useEffect(() => {
    if (data && page > pageCount - 1) setPage(pageCount - 1);
  }, [data, page, pageCount]);

  // Once the landing page's posts are in, jump to the first unread post
  // instead of the top of the page (which would show already-read replies).
  useEffect(() => {
    if (!data || pendingUnread.current == null) return;
    const target = pendingUnread.current;
    pendingUnread.current = null;
    const el = document.getElementById(`post-${target}`);
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [data]);

  // Scroll to the top of the thread on a manual page change. Skipped while an
  // unread landing is pending so it doesn't fight the scroll-into-view above.
  useEffect(() => {
    if (pendingUnread.current != null) return;
    window.scrollTo({ top: 0 });
  }, [page]);

  const changePage = (p: number) => {
    if (p === page) return;
    setReplyOpen(false);
    setPage(p);
  };

  const submitReply = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const client = await getClient(accountId);
      const res = await client.replyToTopic(data?.forumId || '', topicId!, '', body);
      if (!res.ok) throw new Error(res.message || 'The forum rejected the reply.');
      setBody('');
      setReplyOpen(false);
      const last = pageCount - 1;
      if (page === last) reload();
      else setPage(last);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not post.');
    } finally {
      setPosting(false);
    }
  };

  const showMedia = settings?.showMedia ?? true;
  const posts = data?.posts ?? [];

  return (
    <div className="pb-2">
      <Header title={st.title || data?.title || 'Topic'} back busy={loading && posts.length > 0} />
      {error && !data && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading posts…" />}

      {data && (
        <div className="mx-auto max-w-2xl p-4">
          <div className="space-y-3">
            {posts.map((post, i) => {
              const number = page * PAGE_SIZE + i + 1;
              return (
                <article
                  key={post.id || i}
                  id={`post-${number}`}
                  className="scroll-mt-16 rounded-2xl border border-line bg-surface-2 overflow-hidden"
                >
                  <header className="flex items-center gap-2.5 p-3 border-b border-line">
                    <Avatar name={post.author} src={post.authorAvatar} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{post.author || 'Member'}</p>
                      {post.postTime && (
                        <p className="text-xs text-ink-dim">{formatWhen(post.postTime)}</p>
                      )}
                    </div>
                    <span className="text-xs text-ink-dim tabular-nums">#{number}</span>
                  </header>
                  <div className="p-3">
                    <PostContent content={post.content} showMedia={showMedia} />
                  </div>
                </article>
              );
            })}
          </div>

          {error && posts.length > 0 && (
            <p className="text-center text-sm text-[rgb(255,107,107)] mt-3">{error}</p>
          )}

          {/* Reply composer */}
          {data.canReply && (
            <div className="mt-4">
              {replyOpen ? (
                <div className="rounded-2xl border border-line bg-surface-2 p-3 space-y-3">
                  <TextArea
                    autoFocus
                    placeholder="Write a reply…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  {postError && <p className="text-sm text-[rgb(255,107,107)]">{postError}</p>}
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)} disabled={posting}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={submitReply} disabled={posting || !body.trim()}>
                      {posting ? <Spinner /> : 'Post reply'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button full variant="outline" onClick={() => setReplyOpen(true)}>
                  Reply
                </Button>
              )}
            </div>
          )}

          {/* Clear space behind the docked pager so the composer stays visible. */}
          {pageCount > 1 && <div aria-hidden className="h-14" />}
          <Pager dock page={page} pageCount={pageCount} onChange={changePage} disabled={loading} />
        </div>
      )}
    </div>
  );
}
