import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';
import type { OrgNode } from './service.js';

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

function findNode(nodes: OrgNode[], id: string): OrgNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.reports, id);
    if (found) return found;
  }
  return undefined;
}

describe('GET /api/hierarchy', () => {
  it('returns the org tree rooted at Kushagra (super_admin)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hierarchy',
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const tree: OrgNode[] = res.json();
    const root = tree.find((n) => n.id === 'u_kb');
    expect(root).toBeDefined();
    expect(root!.role).toBe('super_admin');

    // Nesting from seed: u_kb -> u_aarti -> u_abha -> u_suhani
    const aarti = findNode(tree, 'u_aarti');
    expect(aarti?.reports.some((r) => r.id === 'u_abha')).toBe(true);
    const abha = findNode(tree, 'u_abha');
    expect(abha?.reports.some((r) => r.id === 'u_suhani')).toBe(true);
  });

  it('forbids a consultant (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hierarchy',
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(403);
  });
});
