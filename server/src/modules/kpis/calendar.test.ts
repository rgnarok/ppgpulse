import { describe, it, expect } from 'vitest';
import { colorForDay, buildCalendar, datesInMonth } from './calendar.js';

describe('colorForDay', () => {
  it('is none when no data was logged for the day', () => {
    expect(colorForDay(0, 4, false)).toBe('none');
    expect(colorForDay(0, 0, false)).toBe('none');
  });

  it('is green at or above target', () => {
    expect(colorForDay(4, 4, true)).toBe('green');
    expect(colorForDay(6, 4, true)).toBe('green');
  });

  it('is amber between 80% and 100% of target', () => {
    expect(colorForDay(4, 5, true)).toBe('amber'); // 80%
  });

  it('is red below 80% of target', () => {
    expect(colorForDay(3, 5, true)).toBe('red'); // 60%
    expect(colorForDay(0, 4, true)).toBe('red'); // 0% but data was logged (e.g. zero-interview day noted)
  });

  it('treats a logged day with zero target as green', () => {
    expect(colorForDay(1, 0, true)).toBe('green');
  });
});

describe('buildCalendar', () => {
  it('marks days absent from actualByDate as no-color', () => {
    const cal = buildCalendar(['2026-07-01', '2026-07-02'], { '2026-07-01': 8 }, 8);
    expect(cal[0]).toMatchObject({ date: '2026-07-01', actual: 8, target: 8, color: 'green' });
    expect(cal[1]).toMatchObject({ date: '2026-07-02', actual: 0, target: 8, color: 'none' });
  });
});

describe('datesInMonth', () => {
  it('returns every day in the month', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28); // 2026 not a leap year
    expect(datesInMonth('2024-02')).toHaveLength(29);
    expect(datesInMonth('2026-07')[0]).toBe('2026-07-01');
    expect(datesInMonth('2026-07').at(-1)).toBe('2026-07-31');
  });
});
