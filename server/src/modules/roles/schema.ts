import { z } from 'zod';

const permissionsSchema = z.record(z.string(), z.array(z.string()));

export const createRoleSchema = z.object({
  key: z
    .string()
    .min(2)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase snake_case'),
  label: z.string().min(1),
  sub: z.string().default(''),
  scope: z.enum(['org', 'team', 'own']),
  permissions: permissionsSchema.default({}),
});

export const updateRoleSchema = z
  .object({
    label: z.string().min(1).optional(),
    sub: z.string().optional(),
    scope: z.enum(['org', 'team', 'own']).optional(),
    permissions: permissionsSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
