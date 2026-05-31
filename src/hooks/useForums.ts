import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function useForums() {
  return useLiveQuery(() => db.forums.orderBy('createdAt').toArray(), []);
}

export function useForum(id: number | null) {
  return useLiveQuery(
    () => (id == null ? undefined : db.forums.get(id)),
    [id]
  );
}
