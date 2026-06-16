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

/** Absolute timestamp, falling back to the raw string if unparseable. */
export function formatWhen(s?: string): string {
  const d = parseForumDate(s);
  return d ? formatStamp(d) : s || '';
}

export function formatFull(s?: string): string {
  const d = parseForumDate(s);
  return d ? formatStamp(d) : s || '';
}
