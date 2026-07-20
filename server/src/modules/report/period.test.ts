import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolvePeriod, inPeriod } from './period.js';

afterEach(() => vi.useRealTimers());

describe('resolvePeriod', () => {
  it('defaults to the current fiscal year (Apr–Mar)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T00:00:00Z'));
    expect(resolvePeriod()).toEqual({ lo: '2026-04-01', hi: '2027-03-31' });
    expect(resolvePeriod({})).toEqual({ lo: '2026-04-01', hi: '2027-03-31' });
  });

  it('defaults to the prior fiscal year when "now" falls Jan–Mar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:00:00Z'));
    expect(resolvePeriod()).toEqual({ lo: '2025-04-01', hi: '2026-03-31' });
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

  it('expands an explicit fy to its Apr–Mar window, taking precedence over the default', () => {
    expect(resolvePeriod({ fy: '2025' })).toEqual({ lo: '2025-04-01', hi: '2026-03-31' });
  });

  it('lets month win over fy', () => {
    expect(resolvePeriod({ fy: '2025', month: '2026-05' })).toEqual({
      lo: '2026-05-01',
      hi: '2026-05-31',
    });
  });

  it('inPeriod is inclusive on both ends', () => {
    const p = resolvePeriod({ month: '2026-05' });
    expect(inPeriod('2026-05-01', p)).toBe(true);
    expect(inPeriod('2026-05-31', p)).toBe(true);
    expect(inPeriod('2026-04-30', p)).toBe(false);
    expect(inPeriod('2026-06-01', p)).toBe(false);
  });
});
