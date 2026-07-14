import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import {
  monthQuerySchema,
  dayQuerySchema,
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
    const { month, team, consultantId } = monthQuerySchema.parse(request.query);
    return monthCounts(app.prisma, request.currentUser, month, { team, consultantId });
  });

  app.get<{ Params: { date: string } }>(
    '/interviews/day/:date',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'interviews', 'view');
      const { date } = dateParamSchema.parse(request.params);
      const { team, consultantId } = dayQuerySchema.parse(request.query);
      return dayView(app.prisma, request.currentUser, date, { team, consultantId });
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
