import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { LoadingScreen, Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { formatWhen } from '../lib/time';
import { usePaged } from '../hooks/usePaged';

// Last committed query per forum, and the Tapatalk search_id that pins each
// (forum, query) result set. Both are module-level so they survive the Search
// screen unmounting when a result is opened — paired with usePaged's cache,
// going back restores the results without re-running the search.
const lastQuery = new Map<number, string>();
const searchIds = new Map<string, string | undefined>();

export function Search() {
  const navigate = useNavigate();
  const forumId = Number(useParams().forumId);

  // `term` is the live input; `query` is the committed search (only changes on
  // submit) so we don't fire a request on every keystroke. Both seed from the
  // last search for this forum so reopening Search shows it again.
  const [term, setTerm] = useState(() => lastQuery.get(forumId) ?? '');
  const [query, setQuery] = useState(() => lastQuery.get(forumId) ?? '');

  const cacheKey = `${forumId}:${query}`;

  const { items, loading, error, done, loadMore, reload } = usePaged(
    async (start, end) => {
      if (!query.trim()) return [];
      // Reset the pinned search_id when a fresh search starts (start === 0).
      if (start === 0) searchIds.delete(cacheKey);
      const client = await getClient(forumId);
      const res = await client.search(query, start, end, searchIds.get(cacheKey));
      if (res.searchId) searchIds.set(cacheKey, res.searchId);
      return res.topics;
    },
    [forumId, query],
    20,
    cacheKey
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    lastQuery.set(forumId, q);
    setQuery(q);
  };

  const searched = query.trim().length > 0;

  return (
    <div>
      <Header title="Search" back busy={loading && items.length > 0} />

      <div className="mx-auto max-w-4xl p-4">
        <form onSubmit={submit} className="flex gap-2">
          <Field
            autoFocus
            type="search"
            placeholder="Search topics and posts…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!term.trim()}>
            Search
          </Button>
        </form>

        {error && items.length === 0 && (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={reload} />
          </div>
        )}

        {searched && loading && items.length === 0 && (
          <LoadingScreen label="Searching…" />
        )}

        {!searched && (
          <p className="text-center text-ink-dim py-16 text-sm">
            Enter a term to search this forum.
          </p>
        )}

        {searched && done && items.length === 0 && !loading && !error && (
          <p className="text-center text-ink-dim py-16 text-sm">
            No results for “{query}”.
          </p>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <button
                  onClick={() =>
                    navigate(`/f/${forumId}/t/${t.id}`, { state: { title: t.title } })
                  }
                  className="w-full rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent/50 transition-colors"
                >
                  <span className="block font-medium line-clamp-2">{t.title}</span>
                  {t.shortContent && (
                    <span className="mt-0.5 block text-xs text-ink-dim line-clamp-2">
                      {t.shortContent}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-ink-dim truncate">
                    {t.forumName ? `${t.forumName} · ` : ''}
                    {t.author}
                    {t.lastReplyAt ? ` · ${formatWhen(t.lastReplyAt)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && items.length > 0 && (
          <p className="text-center text-sm text-[rgb(255,107,107)] mt-3">{error}</p>
        )}

        {!done && items.length > 0 && (
          <div className="mt-4">
            <Button full variant="outline" onClick={loadMore} disabled={loading}>
              {loading ? <Spinner /> : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
