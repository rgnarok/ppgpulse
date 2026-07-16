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
 * Parse the leading `y-m[-d]` components out of a plain calendar string
 * ('YYYY-MM-DD' or 'YYYY-MM'). Purely string arithmetic — never goes through
 * `Date`/timezone conversion, so it's safe for the app's plain ISO-date strings.
 */
function parts(value: string): { y: number; m: number; d?: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { y, m, d };
}

/** 'YYYY-MM-DD' → 'Jul 15, 2026'. Falls back to the raw input if it doesn't parse. */
export function formatDate(dateISO: string | null | undefined): string {
  if (!dateISO) return '—';
  const { y, m, d } = parts(dateISO);
  if (!y || !m || !d) return dateISO;
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

/** 'YYYY-MM' → 'Jul 2026'. Falls back to the raw input if it doesn't parse. */
export function formatMonth(monthISO: string | null | undefined): string {
  if (!monthISO) return '—';
  const { y, m } = parts(monthISO);
  if (!y || !m) return monthISO;
  return `${MONTH_ABBR[m - 1]} ${y}`;
}

/** Today's date as a plain 'YYYY-MM-DD' string, in the browser's local timezone. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Full ISO datetime → 'Jul 15, 2026 · 9:41 AM'. Falls back to the raw input if invalid. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date} · ${h}:${min} ${ampm}`;
}
