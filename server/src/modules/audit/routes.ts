import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { auditLogQuerySchema } from './schema.js';
import { listAuditLog } from './service.js';
import { toAuditLogDto } from './dto.js';

export default async function auditRoutes(app: FastifyInstance) {
  app.get('/audit-log', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'auditlog', 'view');
    const filter = auditLogQuerySchema.parse(request.query);
    const rows = await listAuditLog(app.prisma, filter);
    return rows.map(toAuditLogDto);
  });
}
