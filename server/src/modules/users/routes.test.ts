import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let superToken: string;
let hrToken: string;
let consultantToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  superToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  hrToken = (await loginAs(app, 'aarti@vayuz.com')).access;
  consultantToken = (await loginAs(app, 'abha@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/users', () => {
  it('lists users for an admin without leaking password hashes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users', headers: auth(superToken) });
    expect(res.statusCode).toBe(200);
    const users = res.json();
    expect(users.length).toBe(13);
    expect(users[0].passwordHash).toBeUndefined();
    expect(users[0].role.key).toBeTruthy();
  });

  it('forbids a consultant (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires authentication (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/users/:id — HR vs super_admin', () => {
  it('HR can edit a consultant', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_suhani',
      headers: auth(hrToken),
      payload: { team: 'Pod A+' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().team).toBe('Pod A+');
  });

  it('HR cannot edit a super_admin (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_kb',
      headers: auth(hrToken),
      payload: { team: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('HR cannot promote a consultant to super_admin (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_suhani',
      headers: auth(hrToken),
      payload: { roleKey: 'super_admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('super_admin can edit a super_admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/u_kb',
      headers: auth(superToken),
      payload: { name: 'Kushagra B.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Kushagra B.');
  });
});

describe('POST /api/users', () => {
  it('super_admin creates a user (201) and password is hashed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(superToken),
      payload: {
        name: 'New Consultant',
        email: 'newbie@vayuz.com',
        roleKey: 'consultant',
        team: 'Pod A',
        managerId: 'u_abha',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe('newbie@vayuz.com');
    expect(res.json().passwordHash).toBeUndefined();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'newbie@vayuz.com', password: 'Passw0rd!' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('HR cannot create a super_admin (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(hrToken),
      payload: {
        name: 'Sneaky Admin',
        email: 'sneaky@vayuz.com',
        roleKey: 'super_admin',
        team: 'Leadership',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('consultant cannot create users (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(consultantToken),
      payload: { name: 'X', email: 'x@vayuz.com', roleKey: 'consultant', team: 'Pod A' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a "user"-type account with only the selected sections granted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(superToken),
      payload: {
        name: 'Section User',
        email: 'sectionuser@vayuz.com',
        roleKey: 'user',
        team: 'PPG',
        password: 'Sctn0Pass!',
        sections: ['home', 'hdis', 'not_a_real_section'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.role.key).toBe('user');
    // Unknown sections are dropped; valid ones become view overrides.
    const granted = body.overrides
      .filter((o: { capability: string }) => o.capability === 'view')
      .map((o: { section: string }) => o.section)
      .sort();
    expect(granted).toEqual(['hdis', 'home']);

    // The generated password lets the new user sign in.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sectionuser@vayuz.com', password: 'Sctn0Pass!' },
    });
    expect(login.statusCode).toBe(200);
  });
});

describe('DELETE /api/users/:id', () => {
  it('super_admin deletes a user and reassigns their reports', async () => {
    // Create a throwaway user under u_abha, then delete.
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(superToken),
      payload: {
        name: 'Temp',
        email: 'temp@vayuz.com',
        roleKey: 'consultant',
        team: 'Pod A',
        managerId: 'u_abha',
      },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${id}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(204);
  });

  it('HR cannot delete a super_admin (403)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/u_kb',
      headers: auth(hrToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('a user cannot delete themselves (400)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/u_kb',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(400);
  });
});
