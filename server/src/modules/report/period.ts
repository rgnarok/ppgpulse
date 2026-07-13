/** All-Q1 default window (matches the prototype Q1LO/Q1HI). */
export const Q1_LO = '2025-12-01';
export const Q1_HI = '2026-06-30';

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

/**
 * Resolve a period to an inclusive [lo, hi] ISO-date window.
 * Precedence: explicit from/to → month → (fy or nothing) → default all-Q1.
 * Mirrors the prototype `computePER`.
 */
export function resolvePeriod(input: PeriodInput = {}): Period {
  const { from, to, month } = input;
  if (from && to) return { lo: from, hi: to };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const last = lastDayOfMonth(y, m);
    return { lo: `${month}-01`, hi: `${month}-${String(last).padStart(2, '0')}` };
  }
  // fy / default: this dataset spans a single fiscal quarter.
  return { lo: Q1_LO, hi: Q1_HI };
}

/** Is an ISO date within the inclusive period? */
export function inPeriod(dateIso: string, period: Period): boolean {
  return dateIso >= period.lo && dateIso <= period.hi;
}
