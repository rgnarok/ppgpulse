import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import {
  monthQuerySchema,
  dateParamSchema,
  createInterviewSchema,
  updateInterviewSchema,
} from './schema.js';
import {
  monthCounts,
  dayView,
  createInterview,
  updateInterview,
  deleteInterview,
} from './service.js';

export default async function interviewsRoutes(app: FastifyInstance) {
  app.get('/interviews', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'interviews', 'view');
    const { month } = monthQuerySchema.parse(request.query);
    return monthCounts(app.prisma, request.currentUser, month);
  });

  app.get<{ Params: { date: string } }>(
    '/interviews/day/:date',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'interviews', 'view');
      const { date } = dateParamSchema.parse(request.params);
      return dayView(app.prisma, request.currentUser, date);
    },
  );

  app.post('/interviews', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'interviews', 'edit');
    const input = createInterviewSchema.parse(request.body);
    const created = await createInterview(app.prisma, request.currentUser, input);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    '/interviews/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'interviews', 'edit');
      const input = updateInterviewSchema.parse(request.body);
      return updateInterview(app.prisma, request.params.id, input);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/interviews/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'interviews', 'edit');
      await deleteInterview(app.prisma, request.params.id);
      return reply.status(204).send();
    },
  );
}
