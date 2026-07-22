const MONTH_ABBR = [
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

/**
 * 'YYYY-MM-DD' -> 'Jul 8, 2026'. Purely string arithmetic (no `Date`/timezone
 * conversion), matching the web app's lib/format.ts formatDate — used so
 * human-readable audit-log detail strings read the same way the UI does,
 * instead of embedding a raw ISO date. Falls back to the raw input if it
 * doesn't parse as a plain calendar date.
 */
export function formatDate(dateISO: string | null | undefined): string {
  if (!dateISO) return '—';
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return dateISO;
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}
