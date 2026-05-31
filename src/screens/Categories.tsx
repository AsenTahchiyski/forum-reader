import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import type { ForumNode } from '../forum/types';
import { setActiveForumId } from '../lib/activeForum';
import { useAsync } from '../hooks/useAsync';
import { useForum } from '../hooks/useForums';

export function Categories() {
  const navigate = useNavigate();
  const forumId = Number(useParams().forumId);
  const forum = useForum(Number.isNaN(forumId) ? null : forumId);

  const { data, loading, error, reload } = useAsync(
    () => getClient(forumId).then((c) => c.getForums()),
    [forumId]
  );

  if (!Number.isNaN(forumId)) setActiveForumId(forumId);

  const openNode = (node: ForumNode) => {
    navigate(`/f/${forumId}/sub/${node.id}`, { state: { title: node.title } });
  };

  return (
    <div>
      <Header
        title={forum?.name || 'Forum'}
        back
        busy={loading}
        right={
          <button
            aria-label="Messages"
            onClick={() => navigate(`/f/${forumId}/pm`)}
            className="h-10 w-10 grid place-items-center rounded-full text-ink hover:bg-[rgb(var(--line)/0.6)]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 21 11.5z" />
            </svg>
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingScreen label="Loading forums…" />}
      {data && (
        <div className="mx-auto max-w-2xl p-4 space-y-5">
          {data.map((node) => (
            <NodeGroup key={node.id} node={node} onOpen={openNode} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeGroup({
  node,
  onOpen
}: {
  node: ForumNode;
  onOpen: (n: ForumNode) => void;
}) {
  // A top-level container with children renders as a titled section; otherwise
  // it's a plain forum row.
  const isContainer = node.isCategory || (node.subOnly && node.children.length > 0);

  if (isContainer) {
    return (
      <section>
        <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          {node.title}
        </h2>
        <ul className="space-y-2">
          {node.children.map((child) => (
            <ForumRow key={child.id} node={child} onOpen={onOpen} />
          ))}
        </ul>
      </section>
    );
  }
  return (
    <ul className="space-y-2">
      <ForumRow node={node} onOpen={onOpen} />
    </ul>
  );
}

function ForumRow({
  node,
  onOpen
}: {
  node: ForumNode;
  onOpen: (n: ForumNode) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onOpen(node)}
        className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent/50 transition-colors"
      >
        <span className="h-9 w-9 grid place-items-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-accent shrink-0">
          {node.hasNew ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium truncate">{node.title}</span>
          {node.description && (
            <span className="block text-xs text-ink-dim line-clamp-2">{node.description}</span>
          )}
        </span>
        <svg className="text-ink-dim shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </li>
  );
}
