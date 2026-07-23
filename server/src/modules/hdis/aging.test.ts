import { describe, it, expect } from 'vitest';
import { computeAging, average } from './aging.js';

const NOW = new Date('2026-07-22T00:00:00.000Z');

describe('computeAging', () => {
  it('accrues total days against now while a requirement is still open, with no transitions yet', () => {
    const result = computeAging('2026-07-01', [], NOW, false);
    expect(result.totalDays).toBe(21); // Jul 1 -> Jul 22
    expect(result.transitions['R0->R1']).toBeNull();
    expect(result.transitions['R4->R5']).toBeNull();
  });

  it('computes each transition from the previous stage event (or reqDate for R0->R1)', () => {
    const events = [
      { stage: 'R1', at: '2026-07-05T00:00:00.000Z' }, // 4 days after reqDate
      { stage: 'R2', at: '2026-07-10T00:00:00.000Z' }, // 5 days after R1
    ];
    const result = computeAging('2026-07-01', events, NOW, false);
    expect(result.transitions['R0->R1']).toBe(4);
    expect(result.transitions['R1->R2']).toBe(5);
    expect(result.transitions['R2->R3']).toBeNull();
    // Still open — total keeps accruing to `now`, not frozen at the last event.
    expect(result.totalDays).toBe(21);
  });

  it('freezes total days at the last reached stage once the requirement is closed', () => {
    const events = [
      { stage: 'R1', at: '2026-07-03T00:00:00.000Z' },
      { stage: 'R2', at: '2026-07-05T00:00:00.000Z' },
      { stage: 'R3', at: '2026-07-08T00:00:00.000Z' },
      { stage: 'R4', at: '2026-07-09T00:00:00.000Z' },
      { stage: 'R5', at: '2026-07-12T00:00:00.000Z' },
    ];
    const result = computeAging('2026-07-01', events, NOW, true);
    expect(result.totalDays).toBe(11); // Jul 1 -> Jul 12 (R5 event), not Jul 22 (`now`)
    expect(result.transitions).toEqual({
      'R0->R1': 2,
      'R1->R2': 2,
      'R2->R3': 3,
      'R3->R4': 1,
      'R4->R5': 3,
    });
  });

  it("stops at the last CONTIGUOUS stage reached — a later stage event without its predecessors doesn't count", () => {
    // R5 fired but R2-R4 never did (data anomaly / stage skipped) — R1 is still the
    // last stage the sequential walk can vouch for.
    const events = [
      { stage: 'R1', at: '2026-07-05T00:00:00.000Z' },
      { stage: 'R5', at: '2026-07-12T00:00:00.000Z' },
    ];
    const result = computeAging('2026-07-01', events, NOW, true);
    expect(result.totalDays).toBe(4); // frozen at the R1 event, not the R5 one
    expect(result.transitions['R0->R1']).toBe(4);
    expect(result.transitions['R1->R2']).toBeNull();
    expect(result.transitions['R4->R5']).toBeNull();
  });

  it('keeps only the earliest event per stage if duplicates are passed in', () => {
    const events = [
      { stage: 'R1', at: '2026-07-10T00:00:00.000Z' },
      { stage: 'R1', at: '2026-07-05T00:00:00.000Z' }, // earlier — should win
    ];
    const result = computeAging('2026-07-01', events, NOW, false);
    expect(result.transitions['R0->R1']).toBe(4);
  });
});

describe('average', () => {
  it('averages only the non-null values, rounded to one decimal', () => {
    expect(average([4, 5, null, 7])).toBe(5.3);
    expect(average([null, null])).toBeNull();
    expect(average([])).toBeNull();
    expect(average([10])).toBe(10);
  });
});
