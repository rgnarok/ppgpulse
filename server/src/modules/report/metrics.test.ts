import { describe, it, expect } from 'vitest';
import {
  personStats,
  confidence,
  kpiRating,
  funnel,
  statusReasonMix,
  closureCats,
  isClosed,
  loadBucket,
  kpiBand,
  orgFunnel,
  type ReqLite,
} from './metrics.js';

function req(p: Partial<ReqLite>): ReqLite {
  return {
    ownerName: 'X',
    reqDate: '2026-05-01',
    status: 'Active',
    statusReason: null,
    profiles: 0,
    shortlist: 0,
    l1: 0,
    l2: 0,
    l3: 0,
    onboard: 0,
    jdId: null,
    type: null,
    ...p,
  };
}

describe('isClosed', () => {
  it('is true when onboard>0, status Closed, or status Fulfilled', () => {
    expect(isClosed({ onboard: 1, status: 'Active' })).toBe(true);
    expect(isClosed({ onboard: 0, status: 'Closed' })).toBe(true);
    expect(isClosed({ onboard: 0, status: 'Fulfilled' })).toBe(true);
    expect(isClosed({ onboard: 0, status: 'Active' })).toBe(false);
    expect(isClosed({ onboard: 0, status: 'On Hold' })).toBe(false);
  });
});

describe('personStats', () => {
  it('aggregates counts', () => {
    const st = personStats([
      req({ profiles: 10, shortlist: 8, onboard: 0, l1: 1 }),
      req({ profiles: 6, shortlist: 2, onboard: 1, status: 'Closed', l2: 1 }),
    ]);
    expect(st).toEqual({
      reqs: 2,
      closed: 1,
      profiles: 16,
      shortlist: 10,
      onboard: 1,
      l1: 1,
      l2: 1,
      l3: 0,
    });
  });
});

describe('confidence (prototype formula)', () => {
  it('open req: 8/10 shortlist, no joins → 63 (medium)', () => {
    const st = personStats([req({ profiles: 10, shortlist: 8, onboard: 0, l1: 1 })]);
    const c = confidence(st);
    expect(c.score).toBe(63);
    expect(c.band).toBe('Medium confidence');
    expect(c.factors).toHaveLength(4);
    expect(c.factors[0]).toEqual(['Pipeline progression', 100]);
    expect(c.factors[3]).toEqual(['Conversion to join', 0]);
  });

  it('closed req with a join → 89 (high)', () => {
    const st = personStats([
      req({ profiles: 16, shortlist: 13, onboard: 1, status: 'Closed', l1: 12 }),
    ]);
    const c = confidence(st);
    expect(c.score).toBe(89);
    expect(c.band).toBe('High confidence');
  });

  it('no data → score 0', () => {
    expect(confidence(personStats([])).score).toBe(0);
    expect(confidence(personStats([])).band).toBe('No data');
  });
});

describe('kpiRating (prototype formula)', () => {
  it('open shortlisted req → 1.0 Needs focus', () => {
    const st = personStats([req({ profiles: 10, shortlist: 8 })]);
    expect(kpiRating(st)).toEqual({ val: 1, label: 'Needs focus' });
  });

  it('one closure → 2.1 On track', () => {
    const st = personStats([req({ profiles: 16, shortlist: 13, onboard: 1, status: 'Closed' })]);
    expect(kpiRating(st)).toEqual({ val: 2.1, label: 'On track' });
  });
});

describe('funnel', () => {
  it('maps R0–R5 with target heuristics', () => {
    const st = personStats([req({ profiles: 10, shortlist: 3, l1: 2, l2: 1, l3: 1, onboard: 1 })]);
    const f = funnel(st);
    expect(f.map((s) => s.code)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
    expect(f[0]).toEqual({ code: 'R0', label: 'Profiles', actual: 10, target: 8 });
    expect(f[5]).toEqual({ code: 'R5', label: 'Onboard', actual: 1, target: 1 });
  });
});

describe('loadBucket', () => {
  it('buckets active-requirement counts into LIGHT/OK/OVERLOAD', () => {
    expect(loadBucket(0)).toBe('LIGHT');
    expect(loadBucket(4)).toBe('LIGHT');
    expect(loadBucket(5)).toBe('OK');
    expect(loadBucket(11)).toBe('OK');
    expect(loadBucket(12)).toBe('OVERLOAD');
    expect(loadBucket(20)).toBe('OVERLOAD');
  });
});

describe('kpiBand', () => {
  it('bands the 0-4 kpiRating score into ME/SME/NI', () => {
    expect(kpiBand(3.4)).toBe('ME');
    expect(kpiBand(3)).toBe('ME');
    expect(kpiBand(2.9)).toBe('SME');
    expect(kpiBand(2.5)).toBe('SME');
    expect(kpiBand(2.4)).toBe('NI');
    expect(kpiBand(0)).toBe('NI');
  });
});

describe('statusReasonMix', () => {
  it('groups by status in a stable order, falling back to the bare status with no reason', () => {
    const reqs = [
      req({ status: 'Active' }),
      req({ status: 'Active' }),
      req({ status: 'On Hold', statusReason: 'Hold By client' }),
      req({ status: 'Closed', statusReason: 'Closed by VAYUZ' }),
    ];
    expect(statusReasonMix(reqs)).toEqual([
      { status: 'Active', label: 'Active', count: 2 },
      { status: 'On Hold', label: 'Hold By client', count: 1 },
      { status: 'Closed', label: 'Closed by VAYUZ', count: 1 },
    ]);
  });

  it('surfaces the Fulfilled-by-VAYUZ / Fulfilled-by-others split', () => {
    const reqs = [
      req({ status: 'Fulfilled', statusReason: 'Fulfilled by VAYUZ' }),
      req({ status: 'Fulfilled', statusReason: 'Fulfilled by VAYUZ' }),
      req({ status: 'Fulfilled', statusReason: 'Fulfilled by others' }),
    ];
    expect(statusReasonMix(reqs)).toEqual([
      { status: 'Fulfilled', label: 'Fulfilled by VAYUZ', count: 2 },
      { status: 'Fulfilled', label: 'Fulfilled by others', count: 1 },
    ]);
  });

  it('orders slices Active, On Hold, Fulfilled, Closed regardless of input order', () => {
    const reqs = [
      req({ status: 'Closed', statusReason: 'Closed by others' }),
      req({ status: 'Fulfilled', statusReason: 'Fulfilled by others' }),
      req({ status: 'On Hold', statusReason: 'Hold By VAYUZ' }),
      req({ status: 'Active' }),
    ];
    expect(statusReasonMix(reqs).map((s) => s.status)).toEqual([
      'Active',
      'On Hold',
      'Fulfilled',
      'Closed',
    ]);
  });
});

describe('orgFunnel', () => {
  it('maps stage codes/labels and computes drop-off % between consecutive stages', () => {
    const f = orgFunnel({ r0: 340, r1: 102, r2: 41, r3: 12, r4: 12, r5: 7 });
    expect(f.map((s) => s.code)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
    expect(f[0]).toEqual({ code: 'R0', label: 'Profiles Shared', count: 340, dropoffPct: null });
    // 102/340 kept -> 70% dropped
    expect(f[1]).toEqual({
      code: 'R1',
      label: 'Client Shortlist',
      count: 102,
      dropoffPct: 70,
    });
    // 12/12 kept -> 0% dropped
    expect(f[4]).toEqual({ code: 'R4', label: 'HR Interview', count: 12, dropoffPct: 0 });
    // 7/12 kept -> 42% dropped
    expect(f[5]).toEqual({ code: 'R5', label: 'Offer & Onboarded', count: 7, dropoffPct: 42 });
  });

  it('treats drop-off as 0% when the previous stage was already empty', () => {
    const f = orgFunnel({ r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });
    expect(f.every((s) => s.dropoffPct === null || s.dropoffPct === 0)).toBe(true);
  });
});

describe('closureCats', () => {
  it('splits closed (Closed/Fulfilled/onboarded) requirements by HDIS category', () => {
    const reqs = [
      req({ status: 'Closed', type: 'RADC' }),
      req({ status: 'Fulfilled', type: 'RADC' }),
      req({ onboard: 1, type: 'RADF' }),
      req({ status: 'Closed', type: 'Internal' }),
      req({ status: 'Closed', type: null }),
      req({ status: 'Active', type: 'RADC' }), // not closed — excluded
    ];
    expect(closureCats(reqs)).toEqual({ radc: 2, radf: 1 });
  });
});
