/** Parse mobiquo's dateTime.iso8601 (basic form, e.g. 20240115T13:45:00). */
export function parseForumDate(s?: string): Date | null {
  if (!s) return null;
  const basic = s.match(
    /^(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  );
  if (basic) {
    const [, y, mo, d, h, mi, se] = basic;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se)
    );
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time, falling back to the raw string if unparseable. */
export function formatWhen(s?: string): string {
  const d = parseForumDate(s);
  if (!d) return s || '';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return d.toLocaleDateString();
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return d.toLocaleDateString();
}

export function formatFull(s?: string): string {
  const d = parseForumDate(s);
  return d ? d.toLocaleString() : s || '';
}
