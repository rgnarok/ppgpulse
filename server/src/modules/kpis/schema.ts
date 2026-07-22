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
