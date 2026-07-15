import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { logActivity } from '../audit/service.js';
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
    await logActivity(
      app.prisma,
      request.currentUser,
      'users',
      'create',
      `Created user ${user.name} (${user.email}), role ${user.role.label}`,
      user.id,
    );
    return reply.status(201).send({ ...toUserDto(user), emailSent });
  });

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'users', 'edit');
      const input = updateUserSchema.parse(request.body);
      const user = await updateUser(app.prisma, request.currentUser, request.params.id, input);
      await logActivity(
        app.prisma,
        request.currentUser,
        'users',
        'update',
        `Updated user ${user.name} (${Object.keys(input).join(', ')})`,
        user.id,
      );
      return toUserDto(user);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'users', 'edit');
      const target = await getUser(app.prisma, request.params.id);
      await deleteUser(app.prisma, request.currentUser, request.params.id);
      await logActivity(
        app.prisma,
        request.currentUser,
        'users',
        'delete',
        `Removed user ${target.name} (${target.email})`,
        request.params.id,
      );
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
      await logActivity(
        app.prisma,
        request.currentUser,
        'users',
        grant ? 'grant_override' : 'revoke_override',
        `${grant ? 'Granted' : 'Revoked'} ${section}:${capability} for ${user.name}`,
        user.id,
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
      await logActivity(
        app.prisma,
        request.currentUser,
        'users',
        'set_manager',
        `Set ${user.name}'s manager to ${user.manager?.name ?? 'none'}`,
        user.id,
      );
      return toUserDto(user);
    },
  );
}
