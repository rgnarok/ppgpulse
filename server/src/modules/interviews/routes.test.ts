import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let adminToken: string;
let abhaToken: string; // Pod A consultant
let vanyaToken: string; // Pod C consultant
let abhaConsultantId: string;
let vanyaConsultantId: string;

async function consultantId(token: string, name: string) {
  const res = await app.inject({ method: 'GET', url: '/api/consultants', headers: auth(token) });
  return res.json().find((c: { name: string }) => c.name === name)?.id;
}

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  adminToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  abhaToken = (await loginAs(app, 'abha@vayuz.com')).access;
  vanyaToken = (await loginAs(app, 'vanya@vayuz.com')).access;
  abhaConsultantId = await consultantId(adminToken, 'Abha Sharma');
  vanyaConsultantId = await consultantId(adminToken, 'Vanya Parihar');
});
afterAll(async () => {
  await app.close();
});

describe('interviews add → day + month count', () => {
  it('a consultant can add a row that appears in the day view and month count', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/interviews',
      headers: auth(abhaToken),
      payload: {
        date: '2026-06-10',
        session: 'mid',
        candidate: 'Jane Doe',
        ppgConsultantId: abhaConsultantId,
        stage: 'L1',
        status: 'Scheduled',
      },
    });
    expect(create.statusCode).toBe(201);

    const day = await app.inject({
      method: 'GET',
      url: '/api/interviews/day/2026-06-10',
      headers: auth(abhaToken),
    });
    expect(day.json().mid.length).toBe(1);
    expect(day.json().mid[0].candidate).toBe('Jane Doe');
    expect(day.json().byConsultant).toContainEqual({ name: 'Abha Sharma', count: 1 });

    const month = await app.inject({
      method: 'GET',
      url: '/api/interviews?month=2026-06',
      headers: auth(abhaToken),
    });
    expect(month.json().counts['2026-06-10']).toBe(1);
    expect(month.json().total).toBe(1);
  });

  it('captures the full interview detail set (ref, round, email, profile, interviewer)', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/interviews',
      headers: auth(abhaToken),
      payload: {
        date: '2026-07-09',
        time: '12:30 PM',
        ref: '2026090701',
        round: 'L1',
        candidate: 'Ragini Sankhwar',
        candidateEmail: 'ragini17mar@gmail.com',
        profile: 'Sr. People Consultant',
        interviewer: 'Priya Pal',
        ppgConsultantId: abhaConsultantId,
        status: 'Rejected',
      },
    });
    expect(create.statusCode).toBe(201);

    const day = await app.inject({
      method: 'GET',
      url: '/api/interviews/day/2026-07-09',
      headers: auth(abhaToken),
    });
    const row = day.json().mid[0];
    expect(row.ref).toBe('2026090701');
    expect(row.round).toBe('L1');
    expect(row.candidateEmail).toBe('ragini17mar@gmail.com');
    expect(row.profile).toBe('Sr. People Consultant');
    expect(row.interviewer).toBe('Priya Pal');
    expect(row.ppgConsultantName).toBe('Abha Sharma');
    expect(row.status).toBe('Rejected');
  });

  it('supports edit and delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/interviews',
      headers: auth(abhaToken),
      payload: {
        date: '2026-06-11',
        session: 'end',
        candidate: 'Editable',
        ppgConsultantId: abhaConsultantId,
      },
    });
    const id = created.json().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/interviews/${id}`,
      headers: auth(abhaToken),
      payload: { status: 'Selected' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().status).toBe('Selected');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/interviews/${id}`,
      headers: auth(abhaToken),
    });
    expect(del.statusCode).toBe(204);
  });
});

describe('scope of ppgConsultantId is respected', () => {
  it('a Pod C consultant does not see a Pod A interview', async () => {
    // Vanya (Pod C) fetches the day where Abha (Pod A) logged an interview.
    const day = await app.inject({
      method: 'GET',
      url: '/api/interviews/day/2026-06-10',
      headers: auth(vanyaToken),
    });
    expect(day.json().mid.length).toBe(0);
    expect(day.json().byConsultant.length).toBe(0);
  });

  it('an admin (org scope) sees all interviews', async () => {
    const day = await app.inject({
      method: 'GET',
      url: '/api/interviews/day/2026-06-10',
      headers: auth(adminToken),
    });
    expect(day.json().mid.length).toBe(1);
  });

  it('a Pod C consultant sees their own logged interview', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/interviews',
      headers: auth(vanyaToken),
      payload: {
        date: '2026-06-12',
        session: 'mid',
        candidate: 'PodC Cand',
        ppgConsultantId: vanyaConsultantId,
      },
    });
    const day = await app.inject({
      method: 'GET',
      url: '/api/interviews/day/2026-06-12',
      headers: auth(vanyaToken),
    });
    expect(day.json().mid.length).toBe(1);
  });
});
