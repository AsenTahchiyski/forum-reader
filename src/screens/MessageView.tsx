import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { TextArea } from '../components/Field';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { PostContent } from '../lib/bbcode';
import { formatFull } from '../lib/time';
import { useAsync } from '../hooks/useAsync';
import { useSettings } from '../hooks/useSettings';

export function MessageView() {
  const navigate = useNavigate();
  const { forumId, boxId, msgId } = useParams();
  const accountId = Number(forumId);
  const settings = useSettings();

  const { data, loading, error, reload } = useAsync(
    () => getClient(accountId).then((c) => c.getMessage(msgId!, boxId!)),
    [accountId, boxId, msgId]
  );

  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sendReply = useCallback(async () => {
    if (!data || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const client = await getClient(accountId);
      const subject = data.title.startsWith('Re:') ? data.title : `Re: ${data.title}`;
      const res = await client.sendMessage([data.from], subject, body);
      if (!res.ok) throw new Error(res.message || 'The forum rejected the message.');
      setSent(true);
      setReplyOpen(false);
      setBody('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }, [data, body, accountId]);

  const showMedia = settings?.showMedia ?? true;

  return (
    <div>
      <Header title={data?.title || 'Message'} back busy={loading} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading message…" />}

      {data && (
        <div className="mx-auto max-w-2xl p-4 space-y-4">
          <div className="rounded-2xl border border-line bg-surface-2 overflow-hidden">
            <header className="flex items-center gap-2.5 p-3 border-b border-line">
              <Avatar name={data.from} src={data.fromAvatar} size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{data.from || 'Member'}</p>
                <p className="text-xs text-ink-dim truncate">
                  {data.to.length ? `to ${data.to.join(', ')}` : ''}
                  {data.sentAt ? ` · ${formatFull(data.sentAt)}` : ''}
                </p>
              </div>
            </header>
            <div className="p-3">
              <PostContent content={data.content} showMedia={showMedia} />
            </div>
          </div>

          {sent && (
            <p className="text-sm text-accent text-center">Reply sent.</p>
          )}

          {replyOpen ? (
            <div className="rounded-2xl border border-line bg-surface-2 p-3 space-y-3">
              <TextArea
                autoFocus
                placeholder={`Reply to ${data.from}…`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              {sendError && <p className="text-sm text-[rgb(255,107,107)]">{sendError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={sendReply} disabled={sending || !body.trim()}>
                  {sending ? <Spinner /> : 'Send reply'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => { setSent(false); setReplyOpen(true); }}>
                Reply
              </Button>
              <Button
                variant="ghost"
                full
                onClick={() =>
                  navigate(`/f/${accountId}/compose`, {
                    state: { to: data.from }
                  })
                }
              >
                New message
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
