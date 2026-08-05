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
  const reqA = 'TST_SCORECARD_A_20260605';
  const reqB = 'TST_SCORECARD_B_20260606';

  beforeAll(async () => {
    // Requirement A: single-owner (Abha Sharma), tagged "Java", pushed all the way to
    // Closed with 4 profiles submitted and 1 onboarded — the only terminal requirement
    // in this fixture, so it's the only one that can contribute to dropout rate / TAT.
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(superToken),
      payload: {
        jdId: reqA,
        title: 'Scorecard Fixture A',
        client: 'Testify',
        type: 'RADC',
        techStack: 'Java',
        reqDate: '2026-06-05',
        owners: ['Abha Sharma'],
      },
    });
    const pipelineA = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${reqA}/pipeline`,
      headers: auth(superToken),
      payload: { r0: 4, r1: 3, r2: 3, r3: 2, r4: 2, r5: 1, stage: 'Closed' },
    });
    expect(pipelineA.statusCode).toBe(200);
    expect(pipelineA.json().status).toBe('Closed');

    // Requirement B: co-owned by Abha Sharma AND Pragyashree Jain, tagged "Java",
    // still Active (in progress) — every pipeline count here splits 50/50 between the
    // two owners, and being non-terminal it contributes nothing to dropout rate or TAT.
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(superToken),
      payload: {
        jdId: reqB,
        title: 'Scorecard Fixture B',
        client: 'Testify',
        type: 'RADC',
        techStack: 'Java',
        reqDate: '2026-06-06',
        owners: ['Abha Sharma', 'Pragyashree Jain'],
      },
    });
    const pipelineB = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${reqB}/pipeline`,
      headers: auth(superToken),
      payload: { r0: 2, r1: 1, r2: 1, r3: 1, r4: 0, r5: 0, stage: 'R2 · L1' },
    });
    expect(pipelineB.statusCode).toBe(200);
  });

  it('splits co-owned requirement counts evenly and only counts dropout/TAT from terminal requirements', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/scorecard?month=2026-06',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const abha = body.ranking.find((r: { ownerName: string }) => r.ownerName === 'Abha Sharma');
    expect(abha).toBeTruthy();
    expect(abha.profilesSubmitted).toBe(5); // 4 (solo, req A) + 1 (half of B's r0=2)
    expect(abha.closures).toBe(1); // only req A onboarded (r5=1); B has r5=0
    expect(abha.closureEfficiency).toBeCloseTo(1 / 5);
    expect(abha.l2Conversions).toBeCloseTo(2.5); // A's r3=2 + half of B's r3=1
    expect(abha.l3Conversions).toBe(2); // only A reached L3 (r4=2); B's r4=0
    // Dropout only from req A (terminal): (4 - 1) / 4 = 0.75. Req B (still Active)
    // contributes nothing even though it also has an r0-r5 gap.
    expect(abha.dropoutRate).toBeCloseTo(0.75);
    expect(abha.avgTatDays).toBeGreaterThanOrEqual(0);
    expect(abha.interviewToOfferRatio).toBeCloseTo(2 / 3.5);
    expect(abha.offerToJoinRatio).toBeCloseTo(0.5);
    expect(abha.rank).toBeTruthy();

    const pragyashree = body.ranking.find(
      (r: { ownerName: string }) => r.ownerName === 'Pragyashree Jain',
    );
    expect(pragyashree).toBeTruthy();
    expect(pragyashree.profilesSubmitted).toBe(1); // half of req B's r0=2
    expect(pragyashree.closures).toBe(0);
    // She only co-owns the still-Active requirement B — nothing terminal, so dropout
    // rate and TAT are both unmeasurable (null), not zero.
    expect(pragyashree.dropoutRate).toBeNull();
    expect(pragyashree.avgTatDays).toBeNull();

    // Abha wins every eligible highlight tile against this fixture.
    expect(body.highlights.closureEfficiency.ownerName).toBe('Abha Sharma');
    expect(body.highlights.l2Conversions.ownerName).toBe('Abha Sharma');
    expect(body.highlights.l3Conversions.ownerName).toBe('Abha Sharma');
    expect(body.highlights.lowestTat.ownerName).toBe('Abha Sharma');
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
