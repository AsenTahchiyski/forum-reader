/** Normalize a user-entered board URL and derive likely mobiquo endpoints. */

export function normalizeBaseUrl(input: string): string {
  let s = input.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  // Strip trailing slash and common front-controller filenames.
  s = s.replace(/\/(index|app|viewforum|viewtopic)\.php.*$/i, '');
  s = s.replace(/\/+$/, '');
  return s;
}

/** Endpoints to probe, in order. Honors a URL the user already aimed at mobiquo. */
export function mobiquoCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (/mobiquo\.php\/?$/i.test(trimmed)) {
    return [trimmed.replace(/\/$/, '')];
  }
  const base = normalizeBaseUrl(input);
  if (!base) return [];
  return [`${base}/mobiquo/mobiquo.php`];
}

/**
 * Rewrite youtu.be share links (`https://youtu.be/ID?si=…`) to the canonical
 * `watch?v=ID` form before posting — forums only recognize the latter and turn
 * it into a preview. A `t=` start time is carried over; the rest (`si`) is
 * dropped.
 */
export function normalizeYouTubeLinks(text: string): string {
  return text.replace(
    /https?:\/\/(?:www\.)?youtu\.be\/([\w-]{11})(\?[^\s[\]<]*)?/gi,
    (_m, id: string, query?: string) => {
      const start = query ? new URLSearchParams(query.slice(1)).get('t') : null;
      return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}` : ''}`;
    }
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
