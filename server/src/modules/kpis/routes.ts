import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { logActivity } from '../audit/service.js';
import { createKpiSchema, updateKpiSchema } from './schema.js';
import { listKpis, createKpi, updateKpi, deleteKpi } from './service.js';

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
}
