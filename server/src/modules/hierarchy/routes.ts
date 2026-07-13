import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { orgTree } from './service.js';

export default async function hierarchyRoutes(app: FastifyInstance) {
  app.get('/hierarchy', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'hierarchy', 'view');
    return orgTree(app.prisma);
  });
}
