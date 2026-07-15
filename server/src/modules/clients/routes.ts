import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { listQuerySchema } from './schema.js';
import { listClients } from './service.js';

export default async function clientsRoutes(app: FastifyInstance) {
  // Gated on hdis:view since the client master only exists to power the HDIS form/filter.
  app.get('/clients', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'hdis', 'view');
    const { q } = listQuerySchema.parse(request.query);
    return listClients(app.prisma, q);
  });
}
