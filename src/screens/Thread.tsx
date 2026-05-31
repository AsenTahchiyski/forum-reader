import { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { TextArea } from '../components/Field';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import type { Post } from '../forum/types';
import { PostContent } from '../lib/bbcode';
import { formatWhen } from '../lib/time';
import { usePaged } from '../hooks/usePaged';
import { useSettings } from '../hooks/useSettings';

export function Thread() {
  const { forumId, topicId } = useParams();
  const accountId = Number(forumId);
  const title = (useLocation().state as { title?: string } | null)?.title;
  const settings = useSettings();

  const [meta, setMeta] = useState<{ boardForumId?: string; canReply: boolean }>({
    canReply: true
  });
  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(
    async (start: number, end: number) => {
      const client = await getClient(accountId);
      const thread = await client.getThread(topicId!, start, end);
      setMeta({ boardForumId: thread.forumId, canReply: thread.canReply });
      return thread.posts;
    },
    [accountId, topicId]
  );

  const { items, loading, error, done, loadMore, reload } = usePaged<Post>(
    load,
    [accountId, topicId],
    10
  );

  const submitReply = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const client = await getClient(accountId);
      const res = await client.replyToTopic(
        meta.boardForumId || '',
        topicId!,
        '',
        body
      );
      if (!res.ok) throw new Error(res.message || 'The forum rejected the reply.');
      setBody('');
      setReplyOpen(false);
      reload();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not post.');
    } finally {
      setPosting(false);
    }
  };

  const showMedia = settings?.showMedia ?? true;

  return (
    <div className="pb-2">
      <Header title={title || 'Topic'} back busy={loading && items.length > 0} />
      {error && items.length === 0 && <ErrorBanner message={error} onRetry={reload} />}
      {loading && items.length === 0 && <LoadingScreen label="Loading posts…" />}

      <div className="mx-auto max-w-2xl p-4 space-y-3">
        {items.map((post, i) => (
          <article
            key={post.id || i}
            className="rounded-2xl border border-line bg-surface-2 overflow-hidden"
          >
            <header className="flex items-center gap-2.5 p-3 border-b border-line">
              <Avatar name={post.author} src={post.authorAvatar} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{post.author || 'Member'}</p>
                {post.postTime && (
                  <p className="text-xs text-ink-dim">{formatWhen(post.postTime)}</p>
                )}
              </div>
              <span className="text-xs text-ink-dim">#{i + 1}</span>
            </header>
            <div className="p-3">
              <PostContent content={post.content} showMedia={showMedia} />
            </div>
          </article>
        ))}

        {error && items.length > 0 && (
          <p className="text-center text-sm text-[rgb(255,107,107)]">{error}</p>
        )}

        {!done && items.length > 0 && (
          <div className="py-2 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loading}>
              {loading ? <Spinner /> : 'Load more posts'}
            </Button>
          </div>
        )}
      </div>

      {/* Reply composer */}
      {meta.canReply && items.length > 0 && (
        <div className="mx-auto max-w-2xl px-4">
          {replyOpen ? (
            <div className="rounded-2xl border border-line bg-surface-2 p-3 space-y-3">
              <TextArea
                autoFocus
                placeholder="Write a reply…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              {postError && (
                <p className="text-sm text-[rgb(255,107,107)]">{postError}</p>
              )}
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
    </div>
  );
}
