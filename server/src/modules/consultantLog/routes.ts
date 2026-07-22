import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { BadRequestError } from '../../lib/errors.js';
import { logActivity } from '../audit/service.js';
import { monthQuerySchema, dateParamSchema, createLogSchema, updateLogSchema } from './schema.js';
import { monthCounts, dayEntries, createLog, updateLog, deleteLog } from './service.js';

/** Every route here operates on the caller's OWN activity log — there is no cross-user
 * access; a person's Consultant profile id is resolved from their auth session. */
function ownConsultantId(user: { consultant: { id: string } | null }): string {
  if (!user.consultant) {
    throw new BadRequestError(
      'Only PPG consultants and HR managers have an activity log',
      'no_consultant_profile',
    );
  }
  return user.consultant.id;
}

export default async function consultantLogRoutes(app: FastifyInstance) {
  app.get('/consultant-log', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'profile', 'view');
    const consultantId = ownConsultantId(request.currentUser);
    const { month } = monthQuerySchema.parse(request.query);
    return monthCounts(app.prisma, consultantId, month);
  });

  app.get<{ Params: { date: string } }>(
    '/consultant-log/day/:date',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'profile', 'view');
      const consultantId = ownConsultantId(request.currentUser);
      const { date } = dateParamSchema.parse(request.params);
      return dayEntries(app.prisma, consultantId, date);
    },
  );

  app.post('/consultant-log', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'profile', 'edit');
    const consultantId = ownConsultantId(request.currentUser);
    const input = createLogSchema.parse(request.body);
    const created = await createLog(app.prisma, consultantId, request.currentUser.id, input);
    await logActivity(
      app.prisma,
      request.currentUser,
      'profile',
      'create',
      `Logged activity for ${created.date} (events hosted ${created.eventsHosted}, participated ${created.eventsParticipated}, insights ${created.insights})`,
      created.id,
    );
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    '/consultant-log/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'profile', 'edit');
      const consultantId = ownConsultantId(request.currentUser);
      const input = updateLogSchema.parse(request.body);
      const updated = await updateLog(app.prisma, request.params.id, consultantId, input);
      await logActivity(
        app.prisma,
        request.currentUser,
        'profile',
        'update',
        `Updated activity log entry for ${updated.date}`,
        updated.id,
      );
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/consultant-log/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'profile', 'edit');
      const consultantId = ownConsultantId(request.currentUser);
      await deleteLog(app.prisma, request.params.id, consultantId);
      await logActivity(
        app.prisma,
        request.currentUser,
        'profile',
        'delete',
        `Deleted activity log entry ${request.params.id}`,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );
}
