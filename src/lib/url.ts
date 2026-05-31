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

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
