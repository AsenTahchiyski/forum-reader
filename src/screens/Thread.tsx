import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { TextArea } from '../components/Field';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { Pager } from '../components/Pager';
import { getClient } from '../forum/connection';
import { PostContent, quotePost } from '../lib/bbcode';
import { formatWhen } from '../lib/time';
import { goToProfile } from '../lib/profile';
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
  const navigate = useNavigate();

  // Best estimate of total posts before the first response: replies + opening post.
  const estTotal = st.replyCount != null ? st.replyCount + 1 : null;

  // Tapatalk's get_unread_topic reports `position` as the count of already-read
  // posts — i.e. the 0-based index of the first unread post — so the first
  // unread post's 1-based number is position + 1. (Treating position itself as
  // that number lands a post too early, on the last *read* post.)
  const firstUnread =
    st.unreadPosition && st.unreadPosition > 0 ? st.unreadPosition + 1 : null;

  // Where to start: the first unread post if the plugin told us, otherwise the
  // last page so we can land on the newest post (see landTarget below).
  const [page, setPage] = useState<number>(() => {
    if (firstUnread) return Math.floor((firstUnread - 1) / PAGE_SIZE);
    if (estTotal) return Math.floor((estTotal - 1) / PAGE_SIZE);
    return 0; // total unknown — corrected to the last page once data arrives
  });

  // The post to land on and scroll to when the thread first opens. For a topic
  // with new posts we ask the server for the first unread's position at open
  // time ('unread' until that probe resolves — see the effect below); the
  // topic-list position is only a fallback since regular get_topic browsing
  // omits it and get_unread_topic's snapshot has plugin-specific semantics.
  // Without new posts it's 'last', resolving to the final post once the real
  // total is known, so reopening a read topic lands on the newest post, not the
  // top. We land on its page and scroll to it, leaving earlier posts on that
  // page scrollable above, then mark `landed` so later page changes jump to the
  // top. State, not a ref: the probe resolving must re-run the landing effect.
  const [landTarget, setLandTarget] = useState<number | 'last' | 'unread'>(
    st.hasNew ? 'unread' : (firstUnread ?? 'last')
  );
  const landed = useRef(false);

  // Resolve the authoritative first-unread position via get_thread_by_unread,
  // in parallel with the first page fetch. On plugins without the endpoint (or
  // a missing position) fall back to the topic list's snapshot, then 'last'.
  useEffect(() => {
    if (!st.hasNew) return;
    let cancelled = false;
    (async () => {
      let pos = 0;
      try {
        const client = await getClient(accountId);
        pos = await client.getFirstUnread(topicId!);
      } catch {
        // fall back below
      }
      if (!cancelled) setLandTarget(pos > 0 ? pos : (firstUnread ?? 'last'));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Inline post editing. `editingId` is the post being edited; `editBody` holds
  // its raw (BBCode) draft, fetched via get_raw_post on open. `edited` overrides
  // a post's rendered content after a successful save so we update it in place
  // without refetching the page (and losing scroll position). `editSubject`
  // keeps the post's title so we can send it back unchanged, as save_raw_post
  // requires it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const editSubject = useRef('');

  // Drop the post's text into the composer as a [quote] block, opening it if
  // needed and appending when the user is already drafting.
  const quote = (author: string, content: string) => {
    const block = quotePost(author, content);
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${block}` : block));
    setReplyOpen(true);
    requestAnimationFrame(() => {
      const el = replyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

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

  // Our initial page is only a guess, so once a page loads we jump to the page
  // that actually holds the landing target, then scroll to it — once. The 'last'
  // target resolves to the final post using the now-known total; 'unread' means
  // the first-unread probe is still in flight, so hold off. The clamp guards a
  // reported position past the end (e.g. the topic was fully read after all).
  useEffect(() => {
    if (!data || landed.current || landTarget === 'unread') return;
    const pos = landTarget === 'last' ? total : Math.min(landTarget, total || landTarget);
    if (!pos) return;

    const targetPage = Math.floor((pos - 1) / PAGE_SIZE);
    if (targetPage !== page) {
      setPage(targetPage); // wrong page guessed — refetch the right one
      return;
    }
    landed.current = true;

    const el = document.getElementById(`post-${pos}`);
    if (!el) return;

    // Post content (avatars, embedded images) lays out after this paint and
    // shifts everything above the target, so a single synchronous scroll lands
    // short. Scroll after the next frame, then again as each not-yet-sized image
    // above resolves, so the target stays put while the page settles.
    const scroll = () => el.scrollIntoView({ block: 'start' });
    const raf = requestAnimationFrame(scroll);

    // Only images above the target shift it downward; watching just those avoids
    // snapping the user back if they scroll past the target while images further
    // down are still loading.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    const pending = imgs.filter(
      (img) =>
        !img.complete &&
        el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_PRECEDING
    );
    pending.forEach((img) => {
      img.addEventListener('load', scroll, { once: true });
      img.addEventListener('error', scroll, { once: true });
    });

    // Once the reader scrolls on their own — e.g. up into the history — stop
    // chasing the target. Otherwise every late-loading image above would snap
    // them back down, turning the read into a fight.
    const release = () => {
      pending.forEach((img) => {
        img.removeEventListener('load', scroll);
        img.removeEventListener('error', scroll);
      });
    };
    window.addEventListener('wheel', release, { once: true, passive: true });
    window.addEventListener('touchmove', release, { once: true, passive: true });
    window.addEventListener('keydown', release, { once: true });

    return () => {
      cancelAnimationFrame(raf);
      release();
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
    };
  }, [data, page, total, landTarget]);

  // Scroll to the top of the thread on a manual page change. Skipped while the
  // initial landing is still pending so it doesn't fight the scroll above.
  useEffect(() => {
    if (!landed.current) return;
    window.scrollTo({ top: 0 });
  }, [page]);

  const changePage = (p: number) => {
    if (p === page) return;
    setReplyOpen(false);
    cancelEdit();
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

  // Open the editor for a post and pull its raw body. The reply composer and any
  // other edit are closed first so only one editor is open at a time.
  const startEdit = async (postId: string) => {
    setReplyOpen(false);
    setEditingId(postId);
    setEditBody('');
    setEditError(null);
    setEditLoading(true);
    try {
      const client = await getClient(accountId);
      const res = await client.getRawPost(postId);
      if (!res.ok) throw new Error(res.error || 'This post can no longer be edited.');
      editSubject.current = res.subject;
      setEditBody(res.content);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not load the post.');
    } finally {
      setEditLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody('');
    setEditError(null);
  };

  const saveEdit = async (postId: string) => {
    if (!editBody.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const client = await getClient(accountId);
      const res = await client.saveRawPost(postId, editSubject.current, editBody);
      if (!res.ok) throw new Error(res.message || 'The forum rejected the edit.');
      if (res.content) {
        // Update the rendered post in place; keeps the reader's scroll position.
        setEdited((m) => ({ ...m, [postId]: res.content! }));
      } else {
        // No rendered content came back — refetch so we don't show a stale body.
        reload();
      }
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setEditSaving(false);
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
                    <button
                      type="button"
                      aria-label={`View ${post.author || 'member'}'s profile`}
                      onClick={() => goToProfile(navigate, accountId, post.author, post.authorId)}
                      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <Avatar name={post.author} src={post.authorAvatar} size={34} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => goToProfile(navigate, accountId, post.author, post.authorId)}
                        className="block max-w-full truncate text-sm font-medium text-left hover:text-accent transition-colors"
                      >
                        {post.author || 'Member'}
                      </button>
                      {post.postTime && (
                        <p className="text-xs text-ink-dim">{formatWhen(post.postTime)}</p>
                      )}
                    </div>
                    <span className="text-xs text-ink-dim tabular-nums">#{number}</span>
                  </header>
                  <div className="p-3">
                    {editingId === post.id ? (
                      editLoading ? (
                        <div className="flex justify-center py-4">
                          <Spinner />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <TextArea
                            autoFocus
                            placeholder="Edit your post…"
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                          />
                          {editError && (
                            <p className="text-sm text-[rgb(255,107,107)]">{editError}</p>
                          )}
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={editSaving}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(post.id)}
                              disabled={editSaving || !editBody.trim()}
                            >
                              {editSaving ? <Spinner /> : 'Save'}
                            </Button>
                          </div>
                        </div>
                      )
                    ) : (
                      <PostContent content={edited[post.id] ?? post.content} showMedia={showMedia} />
                    )}
                  </div>
                  {editingId !== post.id && (data.canReply || post.canEdit) && (
                    <footer className="flex justify-end gap-4 px-3 pb-2">
                      {post.canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(post.id)}
                          className="text-xs font-medium text-ink-dim hover:text-accent transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {data.canReply && (
                        <button
                          type="button"
                          onClick={() => quote(post.author, edited[post.id] ?? post.content)}
                          className="text-xs font-medium text-ink-dim hover:text-accent transition-colors"
                        >
                          Quote
                        </button>
                      )}
                    </footer>
                  )}
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
                    ref={replyRef}
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
