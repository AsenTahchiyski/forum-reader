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

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Absolute date like "16 Jun 2026 @ 23:17". */
function formatStamp(d: Date): string {
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} @ ${hh}:${mm}`;
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Friendly relative time, falling back to the raw string if unparseable:
 *   - under 24h old → "3h 12m ago" / "12m ago" / "just now"
 *   - same calendar day → "Today @ 23:17"
 *   - previous calendar day → "Yesterday @ 23:17"
 *   - older → "16 Jun 2026 @ 23:17"
 */
export function formatWhen(s?: string): string {
  const d = parseForumDate(s);
  if (!d) return s || '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const HOUR = 3_600_000;

  if (diffMs >= 0 && diffMs < 24 * HOUR) {
    const mins = Math.floor(diffMs / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m === 0 ? 'just now' : `${m}m ago`;
    return `${h}h ${m}m ago`;
  }

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  if (isSameDay(d, now)) return `Today @ ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `Yesterday @ ${time}`;

  return formatStamp(d);
}

export function formatFull(s?: string): string {
  const d = parseForumDate(s);
  return d ? formatStamp(d) : s || '';
}
