import { z } from 'zod';

export const PERIODICITY_OPTIONS = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Incidental',
] as const;

const kpiFields = {
  kpiNo: z.coerce.number().int().positive('KPI No. must be a positive number'),
  symbol: z.string().trim().min(1, 'Symbol is required'),
  title: z.string().trim().min(1, 'Title is required'),
  target: z.string().trim().min(1, 'Target is required'),
  description: z.string().trim().min(1, 'Description is required'),
  periodicity: z.enum(PERIODICITY_OPTIONS),
  whyItMatters: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
};

export const createKpiSchema = z.object(kpiFields);
export const updateKpiSchema = z.object(kpiFields);

export type CreateKpiInput = z.infer<typeof createKpiSchema>;
export type UpdateKpiInput = z.infer<typeof updateKpiSchema>;

/** 'interviews_per_day' today; kept a free string so new tracked metrics don't need a migration. */
export const TRACKED_METRICS = ['interviews_per_day'] as const;

export const setKpiTargetSchema = z.object({
  target: z.coerce.number().int().min(0, 'Target must be zero or a positive number'),
});

export const setDefaultTargetSchema = setKpiTargetSchema;

export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  team: z.string().min(1).optional(),
});

export type SetKpiTargetInput = z.infer<typeof setKpiTargetSchema>;
