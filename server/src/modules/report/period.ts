export interface PeriodInput {
  from?: string;
  to?: string;
  month?: string; // 'YYYY-MM'
  fy?: string;
}

export interface Period {
  lo: string; // inclusive ISO date
  hi: string; // inclusive ISO date
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** VAYUZ's fiscal year runs April → March; "2025" means FY 2025-26 (Apr 2025–Mar 2026). */
function fyBounds(fy: string): Period {
  const y = Number(fy);
  return { lo: `${y}-04-01`, hi: `${y + 1}-03-31` };
}

/** The fiscal year (starting-year string) containing `now`. */
function currentFy(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return String(m >= 4 ? y : y - 1);
}

/**
 * Resolve a period to an inclusive [lo, hi] ISO-date window.
 * Precedence: explicit from/to → month → fy → default (current fiscal year), so the
 * dashboard always opens scoped to "this year" instead of a fixed historical window.
 */
export function resolvePeriod(input: PeriodInput = {}): Period {
  const { from, to, month, fy } = input;
  if (from && to) return { lo: from, hi: to };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const last = lastDayOfMonth(y, m);
    return { lo: `${month}-01`, hi: `${month}-${String(last).padStart(2, '0')}` };
  }
  if (fy && /^\d{4}$/.test(fy)) return fyBounds(fy);
  return fyBounds(currentFy());
}

/** Is an ISO date within the inclusive period? */
export function inPeriod(dateIso: string, period: Period): boolean {
  return dateIso >= period.lo && dateIso <= period.hi;
}
