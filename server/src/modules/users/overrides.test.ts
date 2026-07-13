import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  superToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

describe('POST /api/users/:id/overrides', () => {
  it('grants a capability that changes the target /me permissions', async () => {
    // Before: consultant Suhani cannot edit HDIS.
    const before = await loginAs(app, 'suhani@vayuz.com');
    const meBefore = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: auth(before.access),
    });
    expect(meBefore.json().permissions.hdis).toEqual(['view']);

    const grant = await app.inject({
      method: 'POST',
      url: '/api/users/u_suhani/overrides',
      headers: auth(superToken),
      payload: { section: 'hdis', capability: 'edit', grant: true },
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json().overrides).toContainEqual({ section: 'hdis', capability: 'edit' });

    // After: a fresh login reflects the override.
    const after = await loginAs(app, 'suhani@vayuz.com');
    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: auth(after.access),
    });
    expect(meAfter.json().permissions.hdis).toContain('edit');
  });

  it('revokes an override', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/u_suhani/overrides',
      headers: auth(superToken),
      payload: { section: 'hdis', capability: 'edit', grant: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().overrides).not.toContainEqual({ section: 'hdis', capability: 'edit' });
  });
});

describe('PATCH /api/users/:id/manager', () => {
  it('updates the reporting line', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_suhani/manager',
      headers: auth(superToken),
      payload: { managerId: 'u_aarti' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().managerId).toBe('u_aarti');
  });

  it('rejects a reporting cycle (400)', async () => {
    // Seed chain u_aarti -> u_abha -> u_pragyashree (unaffected above).
    // Making u_aarti report to its descendant u_pragyashree is a cycle.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_aarti/manager',
      headers: auth(superToken),
      payload: { managerId: 'u_pragyashree' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects self-management (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_abha/manager',
      headers: auth(superToken),
      payload: { managerId: 'u_abha' },
    });
    expect(res.statusCode).toBe(400);
  });
});
