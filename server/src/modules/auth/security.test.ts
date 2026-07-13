import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;
let consultantToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  superToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  consultantToken = (await loginAs(app, 'abha@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

const PROTECTED_GET = [
  '/api/me',
  '/api/users',
  '/api/roles',
  '/api/hierarchy',
  '/api/consultants',
  '/api/report/overview',
  '/api/hdis',
  '/api/interviews?month=2026-06',
];

describe('unauthorized access → 401 without a token', () => {
  for (const url of PROTECTED_GET) {
    it(`${url} requires auth`, async () => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    });
  }
});

describe('forbidden access → 403 for the wrong role', () => {
  const adminOnly = ['/api/users', '/api/roles', '/api/hierarchy'];
  for (const url of adminOnly) {
    it(`consultant is forbidden from ${url}`, async () => {
      const res = await app.inject({ method: 'GET', url, headers: auth(consultantToken) });
      expect(res.statusCode).toBe(403);
    });
    it(`super_admin may access ${url}`, async () => {
      const res = await app.inject({ method: 'GET', url, headers: auth(superToken) });
      expect(res.statusCode).toBe(200);
    });
  }

  it('consultant cannot create HDIS (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(consultantToken),
      payload: {
        jdId: 'X',
        title: 'x',
        client: 'c',
        type: 'RADC',
        status: 'Active',
        reqDate: '2026-06-01',
        owners: [],
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('auth rate limiting', () => {
  it('returns 429 after too many login attempts', async () => {
    const fresh = await testApp();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 25; i++) {
        const res = await fresh.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'ghost@vayuz.com', password: 'nope' },
        });
        codes.push(res.statusCode);
      }
      expect(codes).toContain(429);
    } finally {
      await fresh.close();
    }
  });
});
