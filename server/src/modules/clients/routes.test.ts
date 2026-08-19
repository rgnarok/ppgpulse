import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  adminToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

describe('Client master — duplicate name prevention', () => {
  it('creates a client, then rejects a case-variant duplicate on create', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: auth(adminToken),
      payload: { name: 'Apexon' },
    });
    expect(first.statusCode).toBe(201);

    const dupe = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: auth(adminToken),
      payload: { name: 'apexon' },
    });
    expect(dupe.statusCode).toBe(409);
    const body = dupe.json();
    expect(body.error).toBe('duplicate_client');
    expect(body.message).toContain('Apexon');
  });

  it('rejects an all-caps duplicate too', async () => {
    const dupe = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: auth(adminToken),
      payload: { name: 'APEXON' },
    });
    expect(dupe.statusCode).toBe(409);
  });

  it('rejects renaming a client to clash (case-insensitively) with another existing client', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: auth(adminToken),
      payload: { name: 'Renamable Co' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const clash = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${id}`,
      headers: auth(adminToken),
      payload: { name: 'apexon' },
    });
    expect(clash.statusCode).toBe(409);
  });

  it('allows renaming a client to a different case of its own current name', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: auth(adminToken),
      payload: { name: 'Selfcase Co' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${id}`,
      headers: auth(adminToken),
      payload: { name: 'SELFCASE CO' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('SELFCASE CO');
  });
});
