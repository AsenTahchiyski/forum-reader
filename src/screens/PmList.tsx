import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import type { PmSummary } from '../forum/types';
import { t } from '../lib/i18n';
import { formatWhen } from '../lib/time';
import { usePaged } from '../hooks/usePaged';

export function PmList() {
  const navigate = useNavigate();
  const { forumId, boxId } = useParams();
  const title = (useLocation().state as { title?: string } | null)?.title;

  const load = useCallback(
    (start: number, end: number) =>
      getClient(Number(forumId)).then((c) => c.getBox(boxId!, start, end)),
    [forumId, boxId]
  );

  const { items, loading, error, done, loadMore, reload } = usePaged<PmSummary>(
    load,
    [forumId, boxId]
  );

  return (
    <div>
      <Header title={title || t('msgs.title')} back busy={loading && items.length > 0} />
      {error && items.length === 0 && <ErrorBanner message={error} onRetry={reload} />}
      {loading && items.length === 0 && <LoadingScreen label={t('common.loading')} />}

      <div className="mx-auto max-w-4xl p-4">
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id}>
              <button
                onClick={() =>
                  navigate(`/f/${forumId}/pm/${boxId}/${m.id}`, {
                    state: { title: m.title }
                  })
                }
                className="w-full flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent/50 transition-colors"
              >
                <Avatar name={m.party} src={m.partyAvatar} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {m.isUnread && <span className="h-2 w-2 rounded-full bg-unread shrink-0" />}
                    <span className={`truncate ${m.isUnread ? 'font-semibold' : 'font-medium'}`}>
                      {m.title || t('common.noSubject')}
                    </span>
                  </span>
                  <span className="block text-xs text-ink-dim truncate">
                    {m.party}
                    {m.sentAt ? ` · ${formatWhen(m.sentAt)}` : ''}
                  </span>
                  {m.shortContent && (
                    <span className="block text-xs text-ink-dim/80 line-clamp-1 mt-0.5">
                      {m.shortContent}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {!done && items.length > 0 && (
          <div className="py-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loading}>
              {loading ? <Spinner /> : t('common.loadMore')}
            </Button>
          </div>
        )}
        {done && items.length === 0 && !loading && (
          <p className="text-center text-ink-dim py-10 text-sm">{t('pm.empty')}</p>
        )}
      </div>
    </div>
  );
}
