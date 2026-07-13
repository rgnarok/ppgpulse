import type { PrismaClient } from '@prisma/client';
import type { CurrentUser } from '../modules/rbac/context.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    /** preHandler: verify access token and attach request.currentUser (401 otherwise). */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser: CurrentUser;
  }
}

export {};
