import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { PostContent } from '../lib/bbcode';
import { formatFull, formatWhen } from '../lib/time';
import { useAsync } from '../hooks/useAsync';
import { useSettings } from '../hooks/useSettings';

interface NavState {
  username?: string;
  userId?: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-xs text-ink-dim">{label}</p>
      <p className="text-sm font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

export function Profile() {
  const navigate = useNavigate();
  const { forumId, userId: param } = useParams();
  const accountId = Number(forumId);
  const st = (useLocation().state as NavState | null) ?? {};
  const settings = useSettings();

  // Prefer the identifiers handed over in navigation state; on a cold load
  // (e.g. refresh) fall back to the path segment as the username.
  const username = st.username ?? decodeURIComponent(param ?? '');
  const userId = st.userId;

  const { data, loading, error, reload } = useAsync(
    () => getClient(accountId).then((c) => c.getUserInfo(username, userId)),
    [accountId, username, userId]
  );

  const showMedia = settings?.showMedia ?? true;
  const name = data?.displayName || data?.username || username || 'Member';

  return (
    <div className="pb-2">
      <Header title={name} back busy={loading && !!data} />
      {error && !data && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading profile…" />}

      {data && (
        <div className="mx-auto max-w-2xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={data.avatar} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate">{name}</h2>
              {data.displayName && data.username && data.displayName !== data.username && (
                <p className="text-sm text-ink-dim truncate">@{data.username}</p>
              )}
              <p className="text-xs mt-0.5 flex items-center gap-1.5">
                <span
                  className={
                    'inline-block h-2 w-2 rounded-full ' +
                    (data.isOnline ? 'bg-accent' : 'bg-[rgb(var(--line))]')
                  }
                />
                <span className="text-ink-dim">{data.isOnline ? 'Online' : 'Offline'}</span>
              </p>
            </div>
          </div>

          {(data.postCount != null || data.registeredAt || data.lastActivityAt) && (
            <div className="grid grid-cols-2 gap-2">
              {data.postCount != null && (
                <Stat label="Posts" value={data.postCount.toLocaleString()} />
              )}
              {data.registeredAt && (
                <Stat label="Joined" value={formatFull(data.registeredAt)} />
              )}
              {data.lastActivityAt && (
                <Stat label="Last seen" value={formatWhen(data.lastActivityAt)} />
              )}
            </div>
          )}

          {data.customFields.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface-2 divide-y divide-line">
              {data.customFields.map((f) => (
                <div key={f.name} className="flex gap-3 p-3 text-sm">
                  <span className="text-ink-dim shrink-0 w-28">{f.name}</span>
                  <span className="min-w-0 flex-1 break-words">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {data.signature && (
            <div>
              <p className="text-xs text-ink-dim mb-1.5">Signature</p>
              <div className="rounded-2xl border border-line bg-surface-2 p-3 text-sm">
                <PostContent content={data.signature} showMedia={showMedia} />
              </div>
            </div>
          )}

          {data.canPm !== false && (
            <Button
              full
              variant="outline"
              onClick={() =>
                navigate(`/f/${accountId}/compose`, {
                  state: { to: data.username || username }
                })
              }
            >
              Send message
            </Button>
          )}

          {error && <p className="text-center text-sm text-[rgb(255,107,107)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
