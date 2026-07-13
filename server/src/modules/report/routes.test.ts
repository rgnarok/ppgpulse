import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;
let consultantToken: string; // Abha (Pod A)

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
  it('super_admin all-Q1: 145 reqs, 14 closures (6 RADC/3 RADF), 36 insights, 11/3 events, 10 consultants', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const { tiles } = res.json();
    expect(tiles.requirementsReceived).toBe(145);
    expect(tiles.totalRequirements).toBe(145);
    expect(tiles.totalClosures).toBe(14);
    expect(tiles.closureSplit).toEqual({ radc: 6, radf: 3 });
    expect(tiles.insightsPublished).toBe(36);
    expect(tiles.eventsHosted).toBe(11);
    expect(tiles.eventsParticipated).toBe(3);
    expect(tiles.consultants).toBe(10);
  });

  it('returns 4 chart series', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview',
      headers: auth(superToken),
    });
    const { charts } = res.json();
    expect(charts.requirementsByConsultant.length).toBe(10);
    expect(charts.closuresByConsultant.length).toBe(10);
    expect(charts.confidenceByConsultant.length).toBe(10);
    expect(charts.statusMix).toHaveProperty('active');
    const totalReqs = charts.requirementsByConsultant.reduce(
      (s: number, c: { value: number }) => s + c.value,
      0,
    );
    expect(totalReqs).toBe(145);
  });

  it('a consultant sees a smaller scoped overview', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview',
      headers: auth(consultantToken),
    });
    expect(res.json().tiles.consultants).toBe(4);
    expect(res.json().tiles.requirementsReceived).toBeLessThan(145);
  });

  it('a month filter narrows the window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report/overview?month=2026-05',
      headers: auth(superToken),
    });
    const t = res.json().tiles;
    expect(t.requirementsReceived).toBeGreaterThan(0);
    expect(t.requirementsReceived).toBeLessThan(145);
    expect(res.json().period).toEqual({ lo: '2026-05-01', hi: '2026-05-31' });
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
      url: `/api/report/consultant/${id}`,
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
  it('returns requirement detail with co-owners on the same JD', async () => {
    // Find a requirement id via a consultant report.
    const consRes = await app.inject({
      method: 'GET',
      url: '/api/consultants',
      headers: auth(superToken),
    });
    const bhawana = consRes.json().find((c: { name: string }) => c.name === 'Bhawana Pareek');
    const rep = await app.inject({
      method: 'GET',
      url: `/api/report/consultant/${bhawana.id}`,
      headers: auth(superToken),
    });
    const reqId = rep.json().requirements[0].id;
    const res = await app.inject({
      method: 'GET',
      url: `/api/requirements/${reqId}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().code).toMatch(/^Q1-/);
    expect(res.json()).toHaveProperty('coOwners');
    expect(res.json()).toHaveProperty('pipeline');
  });
});
