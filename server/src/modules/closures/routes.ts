import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { logActivity } from '../audit/service.js';
import { scorecardQuerySchema, closureInputSchema, importSchema, targetsSchema } from './schema.js';
import {
  closuresScorecard,
  createClosure,
  updateClosure,
  deleteClosure,
  importClosures,
  setTargets,
} from './service.js';

export default async function closuresRoutes(app: FastifyInstance) {
  app.get('/closures/scorecard', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'closures', 'view');
    const { fy } = scorecardQuerySchema.parse(request.query);
    return closuresScorecard(app.prisma, fy);
  });

  app.post('/closures', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'closures', 'add');
    const input = closureInputSchema.parse(request.body);
    const created = await createClosure(app.prisma, input, request.currentUser.id);
    await logActivity(
      app.prisma,
      request.currentUser,
      'closures',
      'create',
      `Logged ${created.count} ${created.type} closure(s) for ${created.month}`,
      created.id,
    );
    return reply.status(201).send(created);
  });

  app.post('/closures/import', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'closures', 'add');
    const { text, dryRun } = importSchema.parse(request.body);
    const result = await importClosures(app.prisma, text, dryRun, request.currentUser.id);
    if (result.imported > 0) {
      await logActivity(
        app.prisma,
        request.currentUser,
        'closures',
        'import',
        `Imported ${result.imported} closure line(s) from pasted rows`,
      );
    }
    return result;
  });

  app.patch<{ Params: { id: string } }>(
    '/closures/:id',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'closures', 'edit');
      const input = closureInputSchema.parse(request.body);
      const updated = await updateClosure(app.prisma, request.params.id, input);
      await logActivity(
        app.prisma,
        request.currentUser,
        'closures',
        'update',
        `Edited closure entry for ${updated.month}`,
        updated.id,
      );
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/closures/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'closures', 'delete');
      const gone = await deleteClosure(app.prisma, request.params.id);
      await logActivity(
        app.prisma,
        request.currentUser,
        'closures',
        'delete',
        `Removed ${gone.count} ${gone.type} closure(s) for ${gone.month}`,
        gone.id,
      );
      return reply.status(204).send();
    },
  );

  app.put('/closures/targets', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'closures', 'edit');
    const input = targetsSchema.parse(request.body);
    await setTargets(app.prisma, input);
    await logActivity(
      app.prisma,
      request.currentUser,
      'closures',
      'targets',
      'Updated closure targets',
    );
    return { ok: true };
  });
}
