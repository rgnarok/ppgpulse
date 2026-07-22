import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { logActivity } from '../audit/service.js';
import {
  createKpiSchema,
  updateKpiSchema,
  setKpiTargetSchema,
  setDefaultTargetSchema,
  calendarQuerySchema,
} from './schema.js';
import {
  listKpis,
  createKpi,
  updateKpi,
  deleteKpi,
  listKpiTargets,
  setKpiTarget,
  clearKpiTarget,
  setDefaultTarget,
  interviewsCalendar,
} from './service.js';

export default async function kpisRoutes(app: FastifyInstance) {
  app.get('/kpis', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'kpis', 'view');
    return listKpis(app.prisma);
  });

  app.post('/kpis', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'kpis', 'add');
    const input = createKpiSchema.parse(request.body);
    const created = await createKpi(app.prisma, input);
    await logActivity(
      app.prisma,
      request.currentUser,
      'kpis',
      'create',
      `Added KPI ${created.kpiNo} "${created.title}"`,
      created.id,
    );
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    '/kpis/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'kpis', 'edit');
      const input = updateKpiSchema.parse(request.body);
      const updated = await updateKpi(app.prisma, request.params.id, input);
      await logActivity(
        app.prisma,
        request.currentUser,
        'kpis',
        'update',
        `Updated KPI ${updated.kpiNo} "${updated.title}"`,
        updated.id,
      );
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/kpis/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'kpis', 'delete');
      await deleteKpi(app.prisma, request.params.id);
      await logActivity(
        app.prisma,
        request.currentUser,
        'kpis',
        'delete',
        `Removed KPI ${request.params.id}`,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/kpis/:id/default-target',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'kpis', 'edit');
      const { target } = setDefaultTargetSchema.parse(request.body);
      const updated = await setDefaultTarget(app.prisma, request.params.id, target);
      await logActivity(
        app.prisma,
        request.currentUser,
        'kpis',
        'update',
        `Set default target ${target} for KPI ${updated.kpiNo}`,
        updated.id,
      );
      return updated;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/kpis/:id/targets',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'kpis', 'view');
      return listKpiTargets(app.prisma, request.currentUser, request.params.id);
    },
  );

  app.put<{ Params: { id: string; consultantId: string } }>(
    '/kpis/:id/targets/:consultantId',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'kpis', 'edit');
      const { target } = setKpiTargetSchema.parse(request.body);
      const result = await setKpiTarget(
        app.prisma,
        request.params.id,
        request.params.consultantId,
        target,
      );
      await logActivity(
        app.prisma,
        request.currentUser,
        'kpis',
        'update',
        `Set individual target ${target} for consultant ${request.params.consultantId} on KPI ${request.params.id}`,
        request.params.id,
      );
      return result;
    },
  );

  app.delete<{ Params: { id: string; consultantId: string } }>(
    '/kpis/:id/targets/:consultantId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'kpis', 'edit');
      await clearKpiTarget(app.prisma, request.params.id, request.params.consultantId);
      await logActivity(
        app.prisma,
        request.currentUser,
        'kpis',
        'update',
        `Reverted target to default for consultant ${request.params.consultantId} on KPI ${request.params.id}`,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    '/kpis/:id/calendar',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'kpis', 'view');
      const { month, team } = calendarQuerySchema.parse(request.query);
      return interviewsCalendar(app.prisma, request.currentUser, request.params.id, month, team);
    },
  );
}
