import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/tokens.js';
import { loadCurrentUser } from '../modules/rbac/context.js';
import { UnauthorizedError } from '../lib/errors.js';

/**
 * `authenticate` preHandler: read the Bearer access token, verify it, load the
 * full RBAC user and attach it as request.currentUser. Rejects with 401 on any
 * failure (missing header, bad/expired token, unknown/inactive user).
 */
export default fp(async (app) => {
  app.decorate('authenticate', async function (request: FastifyRequest, _reply: FastifyReply) {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token', 'no_token');
    }
    const token = header.slice('Bearer '.length).trim();
    let sub: string;
    try {
      sub = verifyAccessToken(token).sub;
    } catch {
      throw new UnauthorizedError('Invalid or expired token', 'bad_token');
    }
    const user = await loadCurrentUser(app.prisma, sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive', 'inactive');
    }
    request.currentUser = user;
  });
});
