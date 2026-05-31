/** Remembers which forum the user last opened, so the Messages tab and the
 * favorite-forum redirect have a sensible target. Session-scoped. */
const KEY = 'forum-reader-active-forum';

export function getActiveForumId(): number | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function setActiveForumId(id: number): void {
  try {
    sessionStorage.setItem(KEY, String(id));
  } catch {
    // ignore
  }
}
