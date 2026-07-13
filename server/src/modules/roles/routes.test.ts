import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;
let hrToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  superToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  hrToken = (await loginAs(app, 'aarti@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

async function findRole(token: string, key: string) {
  const res = await app.inject({ method: 'GET', url: '/api/roles', headers: auth(token) });
  return res.json().find((r: { key: string }) => r.key === key);
}

describe('roles API', () => {
  it('lists system roles with permissions', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roles', headers: auth(superToken) });
    expect(res.statusCode).toBe(200);
    const keys = res.json().map((r: { key: string }) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['super_admin', 'hr_manager', 'consultant']));
  });

  it('creates a custom role (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/roles',
      headers: auth(superToken),
      payload: {
        key: 'team_lead',
        label: 'Team Lead',
        sub: 'PPG',
        scope: 'team',
        permissions: { home: ['view'], hdis: ['view', 'edit'] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().permissions.hdis).toEqual(['view', 'edit']);
    expect(res.json().isSystem).toBe(false);
  });

  it('edits a custom role', async () => {
    const role = await findRole(superToken, 'team_lead');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/roles/${role.id}`,
      headers: auth(superToken),
      payload: { permissions: { home: ['view'], hdis: ['view'] } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().permissions.hdis).toEqual(['view']);
  });

  it('HR cannot edit a protected/system role (403)', async () => {
    const superAdminRole = await findRole(superToken, 'super_admin');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/roles/${superAdminRole.id}`,
      headers: auth(hrToken),
      payload: { label: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('HR can create a non-system role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/roles',
      headers: auth(hrToken),
      payload: {
        key: 'hr_helper',
        label: 'HR Helper',
        scope: 'team',
        permissions: { home: ['view'] },
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('deletes a role and reassigns its users to consultant', async () => {
    // Create a role, assign a user to it, delete it, verify reassignment.
    const create = await app.inject({
      method: 'POST',
      url: '/api/roles',
      headers: auth(superToken),
      payload: { key: 'temp_role', label: 'Temp', scope: 'own', permissions: { home: ['view'] } },
    });
    const roleId = create.json().id;
    await app.inject({
      method: 'PATCH',
      url: '/api/users/u_yashna',
      headers: auth(superToken),
      payload: { roleKey: 'temp_role' },
    });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/roles/${roleId}`,
      headers: auth(superToken),
    });
    expect(del.statusCode).toBe(204);

    const user = await app.inject({
      method: 'GET',
      url: '/api/users/u_yashna',
      headers: auth(superToken),
    });
    expect(user.json().role.key).toBe('consultant');
  });

  it('cannot delete a system role', async () => {
    const consultantRole = await findRole(superToken, 'consultant');
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/roles/${consultantRole.id}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(400);
  });
});
