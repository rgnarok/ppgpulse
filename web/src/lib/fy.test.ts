import { describe, it, expect } from 'vitest';
import { fyOfMonth, fyLabel, fyMonths, fiscalYearsFor, currentMonth } from './fy';

describe('fy helpers', () => {
  it('assigns Apr-Dec months to the same-year FY, Jan-Mar to the prior year', () => {
    expect(fyOfMonth('2026-04')).toBe('2026');
    expect(fyOfMonth('2026-06')).toBe('2026');
    expect(fyOfMonth('2026-12')).toBe('2026');
    expect(fyOfMonth('2027-01')).toBe('2026');
    expect(fyOfMonth('2027-03')).toBe('2026');
    expect(fyOfMonth('2027-04')).toBe('2027');
  });

  it('formats a fiscal-year label', () => {
    expect(fyLabel('2025')).toBe('FY 2025-26');
    expect(fyLabel('2026')).toBe('FY 2026-27');
  });

  it('produces the 12 Apr->Mar months for a fiscal year', () => {
    const months = fyMonths('2026');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-04');
    expect(months[8]).toBe('2026-12');
    expect(months[9]).toBe('2027-01');
    expect(months[11]).toBe('2027-03');
  });

  it('derives distinct fiscal years from a list of months, newest first', () => {
    expect(fiscalYearsFor(['2026-06', '2027-02', '2025-05'])).toEqual(['2026', '2025']);
  });

  it('formats "now" as a YYYY-MM month string', () => {
    expect(currentMonth(new Date('2026-07-22T09:00:00Z'))).toBe('2026-07');
    expect(currentMonth(new Date('2026-01-05T09:00:00Z'))).toBe('2026-01');
  });
});
