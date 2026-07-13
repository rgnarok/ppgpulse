import { describe, it, expect } from 'vitest';
import {
  personStats,
  confidence,
  kpiRating,
  funnel,
  statusMix,
  closureCats,
  isClosed,
  type ReqLite,
} from './metrics.js';

function req(p: Partial<ReqLite>): ReqLite {
  return {
    ownerName: 'X',
    reqDate: '2026-05-01',
    status: 'Active',
    profiles: 0,
    shortlist: 0,
    l1: 0,
    l2: 0,
    l3: 0,
    onboard: 0,
    jdId: null,
    ...p,
  };
}

describe('isClosed', () => {
  it('is true when onboard>0 or status Closed', () => {
    expect(isClosed({ onboard: 1, status: 'Active' })).toBe(true);
    expect(isClosed({ onboard: 0, status: 'Closed' })).toBe(true);
    expect(isClosed({ onboard: 0, status: 'Active' })).toBe(false);
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

describe('statusMix and closureCats', () => {
  it('splits status buckets (closed wins over status)', () => {
    const reqs = [
      req({ status: 'Active' }),
      req({ status: 'On Hold' }),
      req({ status: 'Active', onboard: 1 }), // counts as closed
      req({ status: 'Closed' }),
    ];
    expect(statusMix(reqs)).toEqual({ active: 1, onHold: 1, closed: 2 });
  });

  it('splits closures by HDIS category', () => {
    const cats = new Map([
      ['A', 'RADC'],
      ['B', 'RADF'],
      ['C', 'Internal'],
    ]);
    const reqs = [
      req({ status: 'Closed', jdId: 'A' }),
      req({ onboard: 1, jdId: 'B' }),
      req({ status: 'Closed', jdId: 'C' }),
      req({ status: 'Closed', jdId: null }),
    ];
    expect(closureCats(reqs, cats)).toEqual({ radc: 1, radf: 1 });
  });
});
