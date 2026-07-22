/**
 * Fiscal-year helpers. VAYUZ's fiscal year runs April → March, so "FY 2025-26"
 * covers 2025-04 through 2026-03. A fiscal year is identified by its *starting*
 * calendar year as a string, e.g. "2025".
 */

/** The fiscal year (starting-year string) that a YYYY-MM month falls in. */
export function fyOfMonth(monthISO: string): string | null {
  const [y, m] = monthISO.split('-').map(Number);
  if (!y || !m) return null;
  return String(m >= 4 ? y : y - 1);
}

/** Human label for a fiscal-year starting-year string, e.g. "2025" -> "FY 2025-26". */
export function fyLabel(fy: string): string {
  const y = Number(fy);
  if (!y) return fy;
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** The 12 YYYY-MM months (Apr -> Mar) that make up fiscal year `fy`. */
export function fyMonths(fy: string): string[] {
  const y = Number(fy);
  if (!y) return [];
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1; // 4,5,...,12,1,2,3
    const year = m >= 4 ? y : y + 1;
    months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

/** Distinct fiscal years (starting-year strings) covering the given months, newest first. */
export function fiscalYearsFor(monthISOs: string[]): string[] {
  const fys = new Set<string>();
  for (const m of monthISOs) {
    const fy = fyOfMonth(m);
    if (fy) fys.add(fy);
  }
  return [...fys].sort((a, b) => Number(b) - Number(a));
}

/** The fiscal year (starting-year string) containing "now" — used to default filters to
 * the year currently in progress instead of a stale hardcoded one. */
export function currentFy(now: Date = new Date()): string {
  return fyOfMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)!;
}

/** A handful of fiscal years around the current one, newest first — for pickers that
 * don't have a live dataset to derive exact years from (e.g. the Home filter bar). */
export function recentFiscalYears(count = 4, now: Date = new Date()): string[] {
  const cur = Number(currentFy(now));
  return Array.from({ length: count }, (_, i) => String(cur - i));
}

/** The current calendar month as YYYY-MM — used to default period filters to "this
 * month" instead of opening on an unscoped, all-time view. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
