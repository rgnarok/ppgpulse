import { z } from 'zod';

export const hdisTypeEnum = z.enum(['RADC', 'RADF', 'Internal']);
export const hdisStatusEnum = z.enum(['Pending', 'Active', 'On Hold', 'Fulfilled', 'Closed']);

export const listQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  status: z.string().optional(),
  q: z.string().optional(),
});

// New records always start "Pending" — status isn't settable at creation time.
// A requirement can only move to "Active" once its questionnaire (HdisRequirementDetail)
// is complete; see assertCanActivate() in service.ts.
export const createHdisSchema = z.object({
  jdId: z.string().min(2),
  title: z.string().min(1),
  client: z.string().min(1),
  type: hdisTypeEnum,
  openings: z.number().int().positive().default(1),
  statusReason: z.string().min(1).nullable().optional(),
  remarks: z.string().nullable().optional(),
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
    status: hdisStatusEnum.optional(),
    statusReason: z.string().min(1).nullable().optional(),
    remarks: z.string().nullable().optional(),
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

export const requirementDetailSchema = z.object({
  bigMemberName: z.string().min(1).nullable().optional(),
  requirementsReceived: z.number().int().positive().nullable().optional(),
  requirementName: z.string().min(1).nullable().optional(),
  engagementType: z.string().min(1).nullable().optional(),
  clientType: z.string().min(1).nullable().optional(),
  roleBackground: z.string().min(1).nullable().optional(),
  positionOpenDuration: z.string().min(1).nullable().optional(),
  hiringDeadline: z.string().min(1).nullable().optional(),
  interviewRoundsCount: z.number().int().nonnegative().nullable().optional(),
  interviewRoundsDefinition: z.string().min(1).nullable().optional(),
  positionsAlreadyFilled: z.number().int().nonnegative().nullable().optional(),
  clientAttemptedInternalHiring: z.boolean().nullable().optional(),
  internalHiringDuration: z.string().min(1).nullable().optional(),
  internalHiringChannels: z.string().min(1).nullable().optional(),
  internalHiringStageReached: z.string().min(1).nullable().optional(),
  internalHiringChallenges: z.string().min(1).nullable().optional(),
  ctcBlockerGap: z.string().min(1).nullable().optional(),
  maxNoticePeriod: z.string().min(1).nullable().optional(),
  targetCompaniesSuggested: z.string().min(1).nullable().optional(),
  vayuzExclusive: z.boolean().nullable().optional(),
  vendorCount: z.string().min(1).nullable().optional(),
  vendorsSharingProfiles: z.string().min(1).nullable().optional(),
  vendorSubmissionDuration: z.string().min(1).nullable().optional(),
  duplicateProfileTimeline: z.string().min(1).nullable().optional(),
  commercialRates: z.string().min(1).nullable().optional(),
  clientPocDetails: z.string().min(1).nullable().optional(),
  additionalInsights: z.string().min(1).nullable().optional(),
  closureConfidence: z.string().min(1).nullable().optional(),
  exceptionNotes: z.string().min(1).nullable().optional(),
  atsUsed: z.string().min(1).nullable().optional(),
});

export const candidateStageEnum = z.enum(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
export const candidateStatusEnum = z.enum(['Active', 'Offered', 'Joined', 'Dropped']);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createCandidateSchema = z.object({
  name: z.string().min(1),
  techStack: z.string().min(1).nullable().optional(),
  ownerName: z.string().min(1),
  stage: candidateStageEnum.default('R0'),
  status: candidateStatusEnum.default('Active'),
  dropReason: z.string().min(1).nullable().optional(),
  submittedAt: dateStr,
  offeredAt: dateStr.nullable().optional(),
  closedAt: dateStr.nullable().optional(),
});

export const updateCandidateSchema = z
  .object({
    name: z.string().min(1).optional(),
    techStack: z.string().min(1).nullable().optional(),
    ownerName: z.string().min(1).optional(),
    stage: candidateStageEnum.optional(),
    status: candidateStatusEnum.optional(),
    dropReason: z.string().min(1).nullable().optional(),
    submittedAt: dateStr.optional(),
    offeredAt: dateStr.nullable().optional(),
    closedAt: dateStr.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type CreateHdisInput = z.infer<typeof createHdisSchema>;
export type UpdateHdisInput = z.infer<typeof updateHdisSchema>;
export type PipelineInput = z.infer<typeof pipelineSchema>;
export type RequirementDetailInput = z.infer<typeof requirementDetailSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
