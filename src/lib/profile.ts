import type { NavigateFunction } from 'react-router-dom';

/**
 * Navigate to a member's profile. The path segment is the user id when known
 * (stable, plugin-friendly) and otherwise the username; both are passed in
 * navigation state so the Profile screen can call get_user_info either way.
 */
export function goToProfile(
  navigate: NavigateFunction,
  forumId: number | string,
  username: string,
  userId?: string
): void {
  if (!username && !userId) return;
  const seg = userId || username;
  navigate(`/f/${forumId}/u/${encodeURIComponent(seg)}`, {
    state: { username, userId }
  });
}
