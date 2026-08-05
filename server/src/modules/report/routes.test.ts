import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;
let consultantToken: string; // Abha (Pod A)

// Report tiles/charts are period-filtered, and the default period is now "the current
// fiscal year" (see period.ts) rather than a fixed historical window — so any test that
// cares about totals over the *whole* seeded dataset (rather than "this FY") must pass
// an explicit, wide date range. Otherwise these assertions would silently drift as real
// time passes and the fiscal year rolls over.
const ALL_TIME = 'from=2000-01-01&to=2100-01-01';

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  superToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  consultantToken = (await loginAs(app, 'abha@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/consultants (scoped)', () => {
  it('super_admin sees all 10 consultants', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consultants',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(10);
  });

  it('a Pod A consultant sees only their pod (4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consultants',
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().map((c: { name: string }) => c.name);
    expect(names.sort()).toEqual(
      ['Abha Sharma', 'Anshika Rana', 'Pragyashree Jain', 'Suhani Singh'].sort(),
    );
  });
});

describe('GET /api/report/overview', () => {
  it('org-wide, all-time: internally consistent tiles for 10 consultants', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/report/overview?${ALL_TIME}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const { tiles } = res.json();
    expect(tiles.consultants).toBe(10);
    // requirementsReceived/totalRequirements are the same count under two labels.
    expect(tiles.requirementsReceived).toBe(tiles.totalRequirements);
    expect(tiles.requirementsReceived).toBeGreaterThan(0);
    // The RADC/RADF split is a subset of total closures (Internal-type closures and
    // records missing a category aren't included in the split).
    expect(tiles.closureSplit.radc + tiles.closureSplit.radf).toBeLessThanOrEqual(
      tiles.totalClosures,
    );
  });

  it('returns 4 chart series that sum back to the tiles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/report/overview?${ALL_TIME}`,
      headers: auth(superToken),
    });
    const { tiles, charts } = res.json();
    expect(charts.requirementsByConsultant.length).toBe(10);
    expect(charts.closuresByConsultant.length).toBe(10);
    expect(charts.confidenceByConsultant.length).toBe(10);
    expect(Array.isArray(charts.statusReasonMix)).toBe(true);
    // Every slice rolls up under one of the four known statuses.
    for (const slice of charts.statusReasonMix) {
      expect(['Active', 'On Hold', 'Fulfilled', 'Closed']).toContain(slice.status);
    }
    const totalReqs = charts.requirementsByConsultant.reduce(
      (s: number, c: { value: number }) => s + c.value,
      0,
    );
    expect(totalReqs).toBe(tiles.requirementsReceived);
    const totalClosed = charts.closuresByConsultant.reduce(
      (s: number, c: { value: number }) => s + c.value,
      0,
    );
    expect(totalClosed).toBe(tiles.totalClosures);
    const mixTotal = charts.statusReasonMix.reduce(
      (s: number, c: { count: number }) => s + c.count,
      0,
    );
    expect(mixTotal).toBe(tiles.requirementsReceived);
  });

  it('a consultant sees a smaller (or equal) scoped overview', async () => {
    const [orgRes, scopedRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/report/overview?${ALL_TIME}`,
        headers: auth(superToken),
      }),
      app.inject({
        method: 'GET',
        url: `/api/report/overview?${ALL_TIME}`,
        headers: auth(consultantToken),
      }),
    ]);
    expect(scopedRes.json().tiles.consultants).toBe(4);
    expect(scopedRes.json().tiles.requirementsReceived).toBeLessThanOrEqual(
      orgRes.json().tiles.requirementsReceived,
    );
  });

  it('a month filter narrows the window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview?month=2026-05',
      headers: auth(superToken),
    });
    expect(res.json().period).toEqual({ lo: '2026-05-01', hi: '2026-05-31' });
    const monthReqs = res.json().tiles.requirementsReceived;

    const allTimeRes = await app.inject({
      method: 'GET',
      url: `/api/report/overview?${ALL_TIME}`,
      headers: auth(superToken),
    });
    expect(monthReqs).toBeLessThanOrEqual(allTimeRes.json().tiles.requirementsReceived);
  });

  it('an explicit fy expands to its Apr-Mar window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview?fy=2025',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().period).toEqual({ lo: '2025-04-01', hi: '2026-03-31' });
  });
});

describe('GET /api/report/consultant/:id', () => {
  async function consultantId(token: string, name: string) {
    const res = await app.inject({ method: 'GET', url: '/api/consultants', headers: auth(token) });
    return res.json().find((c: { name: string }) => c.name === name).id;
  }

  it('returns confidence, kpi, funnel and requirements', async () => {
    const id = await consultantId(superToken, 'Abha Sharma');
    const res = await app.inject({
      method: 'GET',
      url: `/api/report/consultant/${id}?${ALL_TIME}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.confidence.score).toBeGreaterThanOrEqual(0);
    expect(body.confidence.score).toBeLessThanOrEqual(100);
    expect(body.confidence.factors).toHaveLength(4);
    expect(body.kpi.val).toBeGreaterThanOrEqual(0);
    expect(body.funnel.map((f: { code: string }) => f.code)).toEqual([
      'R0',
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
    ]);
    expect(body.requirements.length).toBeGreaterThan(0);
    // Requirement rows are now HDIS-record-and-owner pairs — jdId doubles as id/code.
    for (const r of body.requirements) {
      expect(r.jdId).toBeTruthy();
      expect(r.id).toBe(r.jdId);
      expect(r.code).toBe(r.jdId);
    }
  });

  it('forbids an out-of-scope consultant (403)', async () => {
    // Abha (Pod A consultant) requesting a Pod C consultant's report.
    const priyaId = await consultantId(superToken, 'Priya Pal');
    const res = await app.inject({
      method: 'GET',
      url: `/api/report/consultant/${priyaId}`,
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/requirements/:id', () => {
  it('returns requirement (HDIS record) detail with co-owners on the same JD', async () => {
    const consRes = await app.inject({
      method: 'GET',
      url: '/api/consultants',
      headers: auth(superToken),
    });
    const abha = consRes.json().find((c: { name: string }) => c.name === 'Abha Sharma');
    const rep = await app.inject({
      method: 'GET',
      url: `/api/report/consultant/${abha.id}?${ALL_TIME}`,
      headers: auth(superToken),
    });
    expect(rep.json().requirements.length).toBeGreaterThan(0);
    const jdId = rep.json().requirements[0].id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/requirements/${jdId}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().jdId).toBe(jdId);
    expect(res.json().code).toBe(jdId);
    expect(res.json()).toHaveProperty('coOwners');
    expect(res.json()).toHaveProperty('pipeline');
  });

  it('404s for an unknown jdId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/requirements/NOT_A_REAL_JD_ID',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/report/scorecard', () => {
  const scorecardJdId = 'TST_SCORECARD_20260601';

  beforeAll(async () => {
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(superToken),
      payload: {
        jdId: scorecardJdId,
        title: 'Scorecard Fixture Role',
        client: 'Testify',
        type: 'RADC',
        reqDate: '2026-06-01',
        owners: ['Abha Sharma'],
      },
    });

    // Abha Sharma: 2 profiles submitted this period — one reaches L2/L3 and Joins
    // (with an offer along the way), the other only gets an offer. Gives her a
    // non-trivial closure efficiency, L2/L3 conversions, interview->offer and
    // offer->join ratio, and a 0% dropout rate, all deterministically.
    const c1 = await app.inject({
      method: 'POST',
      url: `/api/hdis/${scorecardJdId}/candidates`,
      headers: auth(superToken),
      payload: {
        name: 'Scorecard Offered-Only',
        techStack: 'Java',
        ownerName: 'Abha Sharma',
        stage: 'R2',
        status: 'Offered',
        offeredAt: '2026-06-10',
        submittedAt: '2026-06-01',
      },
    });
    expect(c1.statusCode).toBe(201);

    const c2 = await app.inject({
      method: 'POST',
      url: `/api/hdis/${scorecardJdId}/candidates`,
      headers: auth(superToken),
      payload: {
        name: 'Scorecard Joined',
        techStack: 'Java',
        ownerName: 'Abha Sharma',
        stage: 'R5',
        status: 'Joined',
        offeredAt: '2026-06-08',
        closedAt: '2026-06-15',
        submittedAt: '2026-06-02',
      },
    });
    expect(c2.statusCode).toBe(201);

    // Pragyashree Jain: 1 profile submitted, dropped before reaching L1 — a 100%
    // dropout rate and zero closures, so she reliably loses every "best" tile above
    // to Abha but still shows up in the ranking table.
    const c3 = await app.inject({
      method: 'POST',
      url: `/api/hdis/${scorecardJdId}/candidates`,
      headers: auth(superToken),
      payload: {
        name: 'Scorecard Dropped',
        techStack: '.NET',
        ownerName: 'Pragyashree Jain',
        stage: 'R1',
        status: 'Dropped',
        dropReason: 'Compensation mismatch',
        submittedAt: '2026-06-03',
      },
    });
    expect(c3.statusCode).toBe(201);
  });

  it('aggregates per-recruiter metrics scoped to the submitted-in-period candidate set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/scorecard?month=2026-06',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const abha = body.ranking.find((r: { ownerName: string }) => r.ownerName === 'Abha Sharma');
    expect(abha).toBeTruthy();
    expect(abha.profilesSubmitted).toBe(2);
    expect(abha.closures).toBe(1);
    expect(abha.closureEfficiency).toBeCloseTo(0.5);
    expect(abha.l2Conversions).toBe(1);
    expect(abha.l3Conversions).toBe(1);
    expect(abha.dropoutRate).toBe(0);
    expect(abha.avgTatDays).toBe(13); // 2026-06-02 -> 2026-06-15
    expect(abha.offered).toBe(2);
    expect(abha.interviewToOfferRatio).toBe(1);
    expect(abha.offerToJoinRatio).toBeCloseTo(0.5);
    expect(abha.rank).toBeTruthy();

    const pragyashree = body.ranking.find(
      (r: { ownerName: string }) => r.ownerName === 'Pragyashree Jain',
    );
    expect(pragyashree).toBeTruthy();
    expect(pragyashree.profilesSubmitted).toBe(1);
    expect(pragyashree.closures).toBe(0);
    expect(pragyashree.dropped).toBe(1);
    expect(pragyashree.dropoutRate).toBe(1);

    // Abha wins every highlight tile she's eligible for against this fixture.
    expect(body.highlights.closureEfficiency.ownerName).toBe('Abha Sharma');
    expect(body.highlights.l2Conversions.ownerName).toBe('Abha Sharma');
    expect(body.highlights.l3Conversions.ownerName).toBe('Abha Sharma');
    expect(body.highlights.lowestDropoutRate.ownerName).toBe('Abha Sharma');
    expect(body.highlights.highestDropoutRate.ownerName).toBe('Pragyashree Jain');
    expect(body.highlights.interviewToOfferRatio.ownerName).toBe('Abha Sharma');
    expect(body.highlights.offerToJoinRatio.ownerName).toBe('Abha Sharma');

    const javaStack = body.techStackExpertise.find(
      (t: { techStack: string }) => t.techStack === 'Java',
    );
    expect(javaStack.topOwnerName).toBe('Abha Sharma');
    expect(javaStack.closures).toBe(1);
  });

  it('a month outside the fixture returns an empty (but well-shaped) scorecard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/scorecard?month=2019-01',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidateCount).toBe(0);
    expect(body.ranking).toEqual([]);
    expect(body.highlights.closureEfficiency).toBeNull();
  });

  it('forbids a non-super-admin (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/scorecard',
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/report/dhruva', () => {
  it('returns the RAPYD/priority/funnel/top-clients shape for a super admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/dhruva',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rapyd.radc + body.rapyd.radf).toBeLessThanOrEqual(body.rapyd.total);
    expect(body.activeClients).toBeGreaterThanOrEqual(0);
    expect(
      body.priority.p1 + body.priority.p2 + body.priority.p3 + body.priority.uncategorised,
    ).toBe(body.rapyd.total);
    expect(body.funnel.map((f: { code: string }) => f.code)).toEqual([
      'R0',
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
    ]);
    expect(body.funnel[0].dropoffPct).toBeNull();
    expect(Array.isArray(body.topClients.radc)).toBe(true);
    expect(Array.isArray(body.topClients.radf)).toBe(true);
    expect(body.interviewsToday.radc + body.interviewsToday.radf).toBeLessThanOrEqual(
      body.interviewsToday.total,
    );
  });

  it('a priority filter narrows the funnel totals to (at most) the unfiltered total', async () => {
    const [all, p1Only] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/report/dhruva', headers: auth(superToken) }),
      app.inject({
        method: 'GET',
        url: '/api/report/dhruva?priority=P1',
        headers: auth(superToken),
      }),
    ]);
    const allR0 = all.json().funnel[0].count;
    const p1R0 = p1Only.json().funnel[0].count;
    expect(p1R0).toBeLessThanOrEqual(allR0);
  });

  it('forbids a non-super-admin (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/dhruva',
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(403);
  });
});
