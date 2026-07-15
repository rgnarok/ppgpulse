import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { logActivity } from '../audit/service.js';
import { listQuerySchema, createClientSchema, updateClientSchema } from './schema.js';
import { listClients, createClient, updateClient, deleteClient } from './service.js';

export default async function clientsRoutes(app: FastifyInstance) {
  // Gated on hdis:view since the client master only exists to power the HDIS form/filter.
  app.get('/clients', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'hdis', 'view');
    const { q } = listQuerySchema.parse(request.query);
    return listClients(app.prisma, q);
  });

  // Full CRUD reuses the 'hdis' permission section (add/edit/delete) rather than a
  // dedicated 'clients' section — the client master exists solely to serve HDIS.
  app.post('/clients', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'hdis', 'add');
    const { name } = createClientSchema.parse(request.body);
    const created = await createClient(app.prisma, name);
    await logActivity(
      app.prisma,
      request.currentUser,
      'hdis',
      'create_client',
      `Added client "${created.name}"`,
      created.id,
    );
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    '/clients/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'hdis', 'edit');
      const { name } = updateClientSchema.parse(request.body);
      const updated = await updateClient(app.prisma, request.params.id, name);
      await logActivity(
        app.prisma,
        request.currentUser,
        'hdis',
        'update_client',
        `Renamed client to "${updated.name}"`,
        updated.id,
      );
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/clients/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'hdis', 'delete');
      await deleteClient(app.prisma, request.params.id);
      await logActivity(
        app.prisma,
        request.currentUser,
        'hdis',
        'delete_client',
        `Removed client ${request.params.id}`,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );
}
