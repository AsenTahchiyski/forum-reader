/**
 * Remembers a list's page + scroll position across in-app navigation, so that
 * opening a topic and pressing back returns you to where you were. Kept in
 * module memory: it lives for the SPA session and resets on a full reload,
 * which matches what users expect from "back".
 */
interface ListPosition {
  page: number;
  scrollY: number;
}

const positions = new Map<string, ListPosition>();

export function saveListPosition(key: string, pos: ListPosition): void {
  positions.set(key, pos);
}

export function readListPosition(key: string): ListPosition | undefined {
  return positions.get(key);
}
