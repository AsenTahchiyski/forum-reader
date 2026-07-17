import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

interface Paged<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  done: boolean;
  loadMore: () => void;
  reload: () => void;
}

// Snapshots of loaded pages, keyed by `cacheKey`. Module-level so they outlive
// the component unmounting (e.g. opening a search result and navigating back),
// letting us restore results instantly instead of refetching.
const snapshots = new Map<string, { items: unknown[]; start: number; done: boolean }>();

/**
 * Incremental pagination over a `load(start, end)` function (inclusive indices,
 * the mobiquo convention). Resets and fetches the first page whenever `deps`
 * change.
 *
 * Pass `cacheKey` to persist the loaded pages: on mount (or when `deps` change
 * to a previously cached key) the results are restored without a fetch. The key
 * must capture everything `load` depends on, so a different query gets its own
 * snapshot.
 */
export function usePaged<T>(
  load: (start: number, end: number) => Promise<T[]>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[],
  pageSize = 20,
  cacheKey?: string
): Paged<T> {
  const snap = cacheKey ? snapshots.get(cacheKey) : undefined;

  const [items, setItems] = useState<T[]>(() => (snap?.items as T[]) ?? []);
  const [loading, setLoading] = useState(!snap);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(snap?.done ?? false);

  const startRef = useRef(snap?.start ?? 0);
  const doneRef = useRef(snap?.done ?? false);
  const busyRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  // Skip the initial fetch when we restored from cache on mount.
  const didInit = useRef(false);

  const fetchPage = useCallback(async () => {
    if (busyRef.current || doneRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    const from = startRef.current;
    try {
      const batch = await loadRef.current(from, from + pageSize - 1);
      startRef.current = from + batch.length;
      setItems((prev) => (from === 0 ? batch : [...prev, ...batch]));
      if (batch.length < pageSize) {
        doneRef.current = true;
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [pageSize]);

  const reset = useCallback(() => {
    startRef.current = 0;
    doneRef.current = false;
    busyRef.current = false;
    setItems([]);
    setDone(false);
    setError(null);
    setLoading(true);
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    // On the first run we already seeded state from the cache (if any), so don't
    // refetch. On later dep changes, restore from cache when the new key is
    // already loaded, otherwise reset and fetch.
    if (!didInit.current) {
      didInit.current = true;
      if (snap) return;
    } else if (snap) {
      startRef.current = snap.start;
      doneRef.current = snap.done;
      busyRef.current = false;
      setItems(snap.items as T[]);
      setDone(snap.done);
      setError(null);
      setLoading(false);
      return;
    }
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Keep the cache in step with what's currently loaded.
  useEffect(() => {
    if (cacheKey) snapshots.set(cacheKey, { items, start: startRef.current, done });
  }, [cacheKey, items, done]);

  return { items, loading, error, done, loadMore: fetchPage, reload: reset };
}
