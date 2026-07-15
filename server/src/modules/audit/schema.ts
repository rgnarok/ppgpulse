import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  section: z.string().optional(),
  actorId: z.string().optional(),
  q: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
