import { describe, it, expect } from 'vitest';
import { resolvePeriod, inPeriod, Q1_LO, Q1_HI } from './period.js';

describe('resolvePeriod', () => {
  it('defaults to the all-Q1 window', () => {
    expect(resolvePeriod()).toEqual({ lo: Q1_LO, hi: Q1_HI });
    expect(resolvePeriod({})).toEqual({ lo: '2025-12-01', hi: '2026-06-30' });
  });

  it('expands a month to its full range', () => {
    expect(resolvePeriod({ month: '2026-05' })).toEqual({ lo: '2026-05-01', hi: '2026-05-31' });
    expect(resolvePeriod({ month: '2026-02' })).toEqual({ lo: '2026-02-01', hi: '2026-02-28' });
  });

  it('lets explicit from/to win over month', () => {
    expect(resolvePeriod({ from: '2026-04-01', to: '2026-04-15', month: '2026-05' })).toEqual({
      lo: '2026-04-01',
      hi: '2026-04-15',
    });
  });

  it('falls back to default for fy only', () => {
    expect(resolvePeriod({ fy: '2025' })).toEqual({ lo: Q1_LO, hi: Q1_HI });
  });

  it('inPeriod is inclusive on both ends', () => {
    const p = resolvePeriod({ month: '2026-05' });
    expect(inPeriod('2026-05-01', p)).toBe(true);
    expect(inPeriod('2026-05-31', p)).toBe(true);
    expect(inPeriod('2026-04-30', p)).toBe(false);
    expect(inPeriod('2026-06-01', p)).toBe(false);
  });
});
