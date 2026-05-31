import { useCallback, useEffect, useRef, useState } from 'react';

interface Paged<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  done: boolean;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Incremental pagination over a `load(start, end)` function (inclusive indices,
 * the mobiquo convention). Resets and fetches the first page whenever `deps`
 * change.
 */
export function usePaged<T>(
  load: (start: number, end: number) => Promise<T[]>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[],
  pageSize = 20
): Paged<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const startRef = useRef(0);
  const doneRef = useRef(false);
  const busyRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

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
      setError(err instanceof Error ? err.message : 'Failed to load.');
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
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, loading, error, done, loadMore: fetchPage, reload: reset };
}
