import { z } from 'zod';

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventsHosted: z.coerce.number().int().min(0).default(0),
  eventsParticipated: z.coerce.number().int().min(0).default(0),
  insights: z.coerce.number().int().min(0).default(0),
  remarks: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const updateLogSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    eventsHosted: z.coerce.number().int().min(0).optional(),
    eventsParticipated: z.coerce.number().int().min(0).optional(),
    insights: z.coerce.number().int().min(0).optional(),
    remarks: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type CreateLogInput = z.infer<typeof createLogSchema>;
export type UpdateLogInput = z.infer<typeof updateLogSchema>;
