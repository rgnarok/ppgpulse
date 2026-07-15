import type { AuditLog } from '@prisma/client';

export function toAuditLogDto(l: AuditLog) {
  return {
    id: l.id,
    actorId: l.actorId,
    actorName: l.actorName,
    section: l.section,
    action: l.action,
    detail: l.detail,
    entityId: l.entityId,
    at: l.at.toISOString(),
  };
}
