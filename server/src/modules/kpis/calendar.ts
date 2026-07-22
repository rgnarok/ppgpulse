/**
 * Pure day-coloring logic for the "tracked metric" KPI calendar (e.g. interviews/day).
 * Kept dependency-free so it's unit-testable without a database.
 */
export type DayColor = 'green' | 'amber' | 'red' | 'none';

export interface CalendarDay {
  date: string;
  actual: number;
  target: number;
  pct: number | null;
  color: DayColor;
}

/**
 * - No interview data logged for the day at all → 'none' (grey), regardless of target.
 * - Otherwise: actual/target >= 100% → green, >= 80% → amber, below → red.
 * - A day with data but a zero target (no active consultants) is treated as green if
 *   anything was logged, since there was nothing to fall short of.
 */
export function colorForDay(actual: number, target: number, hasData: boolean): DayColor {
  if (!hasData) return 'none';
  if (target <= 0) return 'green';
  const pct = actual / target;
  if (pct >= 1) return 'green';
  if (pct >= 0.8) return 'amber';
  return 'red';
}

/**
 * Build the full day-by-day calendar for a month.
 * `actualByDate` should only contain keys for dates that actually have logged
 * interviews — a date's absence from the map is what marks it "no data".
 */
export function buildCalendar(
  dates: string[],
  actualByDate: Record<string, number>,
  target: number,
): CalendarDay[] {
  return dates.map((date) => {
    const hasData = Object.prototype.hasOwnProperty.call(actualByDate, date);
    const actual = actualByDate[date] ?? 0;
    return {
      date,
      actual,
      target,
      pct: target > 0 ? actual / target : null,
      color: colorForDay(actual, target, hasData),
    };
  });
}

/** All ISO YYYY-MM-DD dates in a given YYYY-MM month. */
export function datesInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
