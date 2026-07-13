import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

/** Build a ready Fastify app for injection-based tests. */
export async function testApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export interface LoginResult {
  access: string;
  refresh: string;
  user: { id: string; name: string; email: string; role: { key: string; label: string } };
}

/** Log in a seeded user and return tokens (default seeded password). */
export async function loginAs(
  app: FastifyInstance,
  email: string,
  password = 'Passw0rd!',
): Promise<LoginResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  }
  return res.json() as LoginResult;
}

/** Authorization header for a bearer token. */
export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
