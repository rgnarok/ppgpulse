import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { createUserSchema, updateUserSchema, overrideSchema, managerSchema } from './schema.js';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUser,
  setOverride,
  setManager,
} from './service.js';
import { toUserDto } from './dto.js';

export default async function usersRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'users', 'view');
    const users = await listUsers(app.prisma);
    return users.map(toUserDto);
  });

  app.get<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'users', 'view');
      return toUserDto(await getUser(app.prisma, request.params.id));
    },
  );

  app.post('/users', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'users', 'edit');
    const input = createUserSchema.parse(request.body);
    const { user, emailSent } = await createUser(app.prisma, request.currentUser, input);
    return reply.status(201).send({ ...toUserDto(user), emailSent });
  });

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'users', 'edit');
      const input = updateUserSchema.parse(request.body);
      const user = await updateUser(app.prisma, request.currentUser, request.params.id, input);
      return toUserDto(user);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'users', 'edit');
      await deleteUser(app.prisma, request.currentUser, request.params.id);
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/users/:id/overrides',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'users', 'edit');
      const { section, capability, grant } = overrideSchema.parse(request.body);
      const user = await setOverride(
        app.prisma,
        request.currentUser,
        request.params.id,
        section,
        capability,
        grant,
      );
      return toUserDto(user);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/users/:id/manager',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'users', 'edit');
      const { managerId } = managerSchema.parse(request.body);
      const user = await setManager(app.prisma, request.currentUser, request.params.id, managerId);
      return toUserDto(user);
    },
  );
}
