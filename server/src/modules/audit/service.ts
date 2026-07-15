import type { PrismaClient } from '@prisma/client';
import type { CurrentUser } from '../rbac/index.js';

/**
 * Best-effort write to the platform activity log. Never throws — a logging failure
 * must not roll back or fail the action it's describing.
 */
export async function logActivity(
  prisma: PrismaClient,
  actor: CurrentUser,
  section: string,
  action: string,
  detail: string,
  entityId?: string | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        section,
        action,
        detail,
        entityId: entityId ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write log entry', err);
  }
}

export interface AuditLogFilter {
  section?: string;
  actorId?: string;
  q?: string;
}

/** Most recent entries first, optionally filtered. Capped so the endpoint stays fast
 * without needing full pagination support — the UI further paginates client-side. */
export function listAuditLog(prisma: PrismaClient, filter: AuditLogFilter = {}) {
  return prisma.auditLog.findMany({
    where: {
      section: filter.section || undefined,
      actorId: filter.actorId || undefined,
      ...(filter.q
        ? {
            OR: [
              { detail: { contains: filter.q, mode: 'insensitive' as const } },
              { actorName: { contains: filter.q, mode: 'insensitive' as const } },
              { action: { contains: filter.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { at: 'desc' },
    take: 1000,
  });
}
