import { z } from 'zod';

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createInterviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.enum(['mid', 'end']),
  time: z.string().optional(),
  candidate: z.string().min(1),
  requirementRef: z.string().optional(),
  ppgConsultantId: z.string().nullable().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export const updateInterviewSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    session: z.enum(['mid', 'end']).optional(),
    time: z.string().nullable().optional(),
    candidate: z.string().min(1).optional(),
    requirementRef: z.string().nullable().optional(),
    ppgConsultantId: z.string().nullable().optional(),
    stage: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
