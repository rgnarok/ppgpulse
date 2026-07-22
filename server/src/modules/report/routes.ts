import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertCan } from '../rbac/index.js';
import {
  listScopedConsultants,
  overview,
  consultantReport,
  requirementDetail,
  teamRoster,
  dhruvaDashboard,
} from './service.js';

const periodQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  fy: z.string().optional(),
});

const overviewQuery = periodQuery.extend({
  consultantId: z.string().optional(),
});

const dhruvaQuery = periodQuery.extend({
  priority: z.string().optional(),
  client: z.string().optional(),
  ppg: z.string().optional(),
});

export default async function reportRoutes(app: FastifyInstance) {
  app.get('/consultants', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'myteam', 'view');
    return listScopedConsultants(app.prisma, request.currentUser);
  });

  app.get('/report/roster', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'myteam', 'view');
    return teamRoster(app.prisma, request.currentUser);
  });

  app.get('/report/overview', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'home', 'view');
    const q = overviewQuery.parse(request.query);
    return overview(app.prisma, request.currentUser, q);
  });

  app.get<{ Params: { id: string } }>(
    '/report/consultant/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'home', 'view');
      const q = periodQuery.parse(request.query);
      return consultantReport(app.prisma, request.currentUser, request.params.id, q);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/requirements/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'home', 'view');
      return requirementDetail(app.prisma, request.currentUser, request.params.id);
    },
  );

  app.get('/report/dhruva', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'dhruva', 'view');
    const q = dhruvaQuery.parse(request.query);
    return dhruvaDashboard(app.prisma, request.currentUser, q);
  });
}
