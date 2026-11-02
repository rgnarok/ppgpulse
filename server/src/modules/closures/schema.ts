import { z } from 'zod';

export const CLOSURE_TYPES = ['RADC', 'RADF', 'Internal'] as const;
export type ClosureType = (typeof CLOSURE_TYPES)[number];

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

export const scorecardQuerySchema = z.object({
  fy: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export const closureInputSchema = z.object({
  month,
  userId: z.string().min(1).nullable().optional(),
  type: z.enum(CLOSURE_TYPES),
  count: z.coerce.number().int().min(0).max(999).default(1),
  client: z.string().trim().max(200).nullable().optional(),
  candidate: z.string().trim().max(200).nullable().optional(),
});

export const importSchema = z.object({
  text: z.string().min(1).max(200_000),
  /** true = validate only, write nothing */
  dryRun: z.boolean().default(false),
});

export const targetsSchema = z.object({
  /** Default per-month team target. */
  teamDefault: z.number().int().min(0).max(9999).optional(),
  /** Month-specific team targets; null clears the override. */
  teamMonths: z.record(month, z.number().int().min(0).max(9999).nullable()).optional(),
  /** Per-recruiter monthly target keyed by user id; null clears it. */
  recruiters: z.record(z.string(), z.number().int().min(0).max(999).nullable()).optional(),
});

export type ClosureInput = z.infer<typeof closureInputSchema>;
export type TargetsInput = z.infer<typeof targetsSchema>;
