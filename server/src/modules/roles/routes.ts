import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { createRoleSchema, updateRoleSchema } from './schema.js';
import { listRoles, createRole, updateRole, deleteRole } from './service.js';

export default async function rolesRoutes(app: FastifyInstance) {
  app.get('/roles', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'roles', 'view');
    return listRoles(app.prisma);
  });

  app.post('/roles', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'roles', 'edit');
    const input = createRoleSchema.parse(request.body);
    const role = await createRole(app.prisma, request.currentUser, input);
    return reply.status(201).send(role);
  });

  app.patch<{ Params: { id: string } }>(
    '/roles/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'roles', 'edit');
      const input = updateRoleSchema.parse(request.body);
      return updateRole(app.prisma, request.currentUser, request.params.id, input);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/roles/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'roles', 'edit');
      await deleteRole(app.prisma, request.currentUser, request.params.id);
      return reply.status(204).send();
    },
  );
}
