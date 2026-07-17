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
import { t } from '../lib/i18n';
import { formatFull } from '../lib/time';
import { goToProfile } from '../lib/profile';
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
      if (!res.ok) throw new Error(res.message || t('mv.rejected'));
      setSent(true);
      setReplyOpen(false);
      setBody('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('mv.couldNotSend'));
    } finally {
      setSending(false);
    }
  }, [data, body, accountId]);

  const showMedia = settings?.showMedia ?? true;

  return (
    <div>
      <Header title={data?.title || t('mv.message')} back busy={loading} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label={t('mv.loading')} />}

      {data && (
        <div className="mx-auto max-w-4xl p-4 space-y-4">
          <div className="rounded-2xl border border-line bg-surface-2 overflow-hidden">
            <header className="flex items-center gap-2.5 p-3 border-b border-line">
              <button
                type="button"
                aria-label={t('common.viewProfile', { name: data.from || t('common.member') })}
                onClick={() => goToProfile(navigate, accountId, data.from)}
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Avatar name={data.from} src={data.fromAvatar} size={38} />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => goToProfile(navigate, accountId, data.from)}
                  className="block max-w-full truncate text-sm font-medium text-left hover:text-accent transition-colors"
                >
                  {data.from || t('common.member')}
                </button>
                <p className="text-xs text-ink-dim truncate">
                  {data.to.length ? t('mv.to', { names: data.to.join(', ') }) : ''}
                  {data.sentAt ? ` · ${formatFull(data.sentAt)}` : ''}
                </p>
              </div>
            </header>
            <div className="p-3">
              <PostContent content={data.content} showMedia={showMedia} />
            </div>
          </div>

          {sent && (
            <p className="text-sm text-accent text-center">{t('mv.replySent')}</p>
          )}

          {replyOpen ? (
            <div className="rounded-2xl border border-line bg-surface-2 p-3 space-y-3">
              <TextArea
                autoFocus
                placeholder={t('mv.replyTo', { name: data.from })}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              {sendError && <p className="text-sm text-[rgb(255,107,107)]">{sendError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)} disabled={sending}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={sendReply} disabled={sending || !body.trim()}>
                  {sending ? <Spinner /> : t('mv.sendReply')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => { setSent(false); setReplyOpen(true); }}>
                {t('common.reply')}
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
                {t('msgs.new')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
