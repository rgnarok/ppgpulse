import { z } from 'zod';

export const hdisTypeEnum = z.enum(['RADC', 'RADF', 'Internal']);

export const listQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  status: z.string().optional(),
  q: z.string().optional(),
});

export const createHdisSchema = z.object({
  jdId: z.string().min(2),
  title: z.string().min(1),
  client: z.string().min(1),
  type: hdisTypeEnum,
  openings: z.number().int().positive().default(1),
  status: z.enum(['Active', 'On Hold', 'Closed']),
  priority: z.string().default('NA'),
  confidence: z.string().default('Medium'),
  reqDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jdLink: z.string().url().nullable().optional(),
  owners: z.array(z.string().min(1)).default([]),
});

export const updateHdisSchema = z
  .object({
    title: z.string().min(1).optional(),
    client: z.string().min(1).optional(),
    type: hdisTypeEnum.optional(),
    openings: z.number().int().positive().optional(),
    status: z.enum(['Active', 'On Hold', 'Closed']).optional(),
    priority: z.string().optional(),
    confidence: z.string().optional(),
    reqDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    owners: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const pipelineSchema = z.object({
  r0: z.number().int().min(0),
  r1: z.number().int().min(0),
  r2: z.number().int().min(0),
  r3: z.number().int().min(0),
  r4: z.number().int().min(0),
  r5: z.number().int().min(0),
  stage: z.string().min(1),
});

export const linkSchema = z.object({
  jdLink: z.string().url().nullable(),
});

export type CreateHdisInput = z.infer<typeof createHdisSchema>;
export type UpdateHdisInput = z.infer<typeof updateHdisSchema>;
export type PipelineInput = z.infer<typeof pipelineSchema>;
