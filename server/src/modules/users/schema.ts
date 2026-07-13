import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  roleKey: z.string().min(1),
  team: z.string().min(1),
  managerId: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    roleKey: z.string().min(1).optional(),
    team: z.string().min(1).optional(),
    managerId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const overrideSchema = z.object({
  section: z.string().min(1),
  capability: z.string().min(1),
  grant: z.boolean().default(true),
});

export const managerSchema = z.object({
  managerId: z.string().nullable(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
