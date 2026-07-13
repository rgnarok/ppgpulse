import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
});
afterAll(async () => {
  await app.close();
});

describe('POST /api/auth/login', () => {
  it('accepts valid credentials and returns tokens + user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'kushagra@vayuz.com', password: 'Passw0rd!' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access).toBeTruthy();
    expect(body.refresh).toBeTruthy();
    expect(body.user.role.key).toBe('super_admin');
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejects a wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'kushagra@vayuz.com', password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown email with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@vayuz.com', password: 'Passw0rd!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates input (400 on malformed body)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/me', () => {
  it('returns identity, effective permissions and scope', async () => {
    const { access } = await loginAs(app, 'abha@vayuz.com');
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: auth(access) });
    expect(res.statusCode).toBe(200);
    const me = res.json();
    expect(me.email).toBe('abha@vayuz.com');
    expect(me.role.key).toBe('consultant');
    expect(me.scope).toBe('team');
    expect(me.permissions.hdis).toEqual(['view']);
    expect(me.consultant).not.toBeNull();
    expect(me.permissions.users).toBeUndefined();
  });

  it('rejects a missing token with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a garbage token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: auth('garbage.token.value'),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('refresh rotation and logout', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const { refresh } = await loginAs(app, 'rohit@vayuz.com');
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json();
    expect(rotated.access).toBeTruthy();
    expect(rotated.refresh).toBeTruthy();
    expect(rotated.refresh).not.toBe(refresh);

    // The original refresh token must no longer work (rotation).
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh },
    });
    expect(reuse.statusCode).toBe(401);

    // The new access token authenticates /me.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(rotated.access) });
    expect(me.statusCode).toBe(200);
  });

  it('logout invalidates the refresh token', async () => {
    const { refresh } = await loginAs(app, 'priya@vayuz.com');
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refresh },
    });
    expect(out.statusCode).toBe(200);
    const after = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh },
    });
    expect(after.statusCode).toBe(401);
  });
});
