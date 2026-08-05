import type { Prisma, PrismaClient, HdisType } from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { getStorage, ALLOWED_UPLOAD_MIME } from '../../lib/storage.js';
import { getConfig } from '../../config.js';
import { ensureClient } from '../clients/service.js';
import { loadDirectory, scopeNames, can, type CurrentUser } from '../rbac/index.js';
import { computeAging } from './aging.js';
import type {
  CreateHdisInput,
  UpdateHdisInput,
  PipelineInput,
  RequirementDetailInput,
  CreateCandidateInput,
  UpdateCandidateInput,
} from './schema.js';

const detailInclude = {
  owners: true,
  pipeline: true,
  attachments: { orderBy: { at: 'desc' } },
  stageEvents: true,
  detail: true,
} as const satisfies Prisma.HdisInclude;

/** The questionnaire fields that must be filled in before a requirement can go
 * "Active" — everything else on HdisRequirementDetail is optional context. Kept as
 * a single list so the completeness check and the frontend's progress indicator
 * can't drift apart from each other. */
export const REQUIRED_DETAIL_FIELDS = [
  'bigMemberName',
  'requirementsReceived',
  'requirementName',
  'engagementType',
  'clientType',
  'roleBackground',
  'positionOpenDuration',
  'hiringDeadline',
  'interviewRoundsCount',
  'interviewRoundsDefinition',
  'positionsAlreadyFilled',
  'clientAttemptedInternalHiring',
  'vayuzExclusive',
  'vendorCount',
  'vendorsSharingProfiles',
  'vendorSubmissionDuration',
  'duplicateProfileTimeline',
  'commercialRates',
  'clientPocDetails',
  'additionalInsights',
  'closureConfidence',
  'atsUsed',
] as const;

/** Completeness also requires at least one attachment — the questionnaire's "Screenshot
 * Attachment - Requirement Receiving Email from Client" is satisfied by the record's
 * existing Attachments feature rather than a separate upload field. */
function isDetailComplete(
  detail: Partial<Record<(typeof REQUIRED_DETAIL_FIELDS)[number], unknown>> | null | undefined,
  hasAttachment: boolean,
): boolean {
  if (!detail || !hasAttachment) return false;
  return REQUIRED_DETAIL_FIELDS.every((f) => {
    const v = detail[f];
    return v !== null && v !== undefined && v !== '';
  });
}

/** Matches isClosed() in report/metrics.ts, at the whole-record level (no per-owner
 * onboard split needed here — pipeline.r5 already IS the onboard count). */
function isClosedRecord(status: string, r5: number): boolean {
  return status === 'Closed' || status === 'Fulfilled' || r5 > 0;
}

type HdisDetail = Prisma.HdisGetPayload<{ include: typeof detailInclude }>;

/** pipeline stage → requirement status (recorder direction). */
function statusForStage(stage: string): string {
  return stage === 'Closed' ? 'Closed' : stage === 'On Hold' ? 'On Hold' : 'Active';
}

/** status → initial pipeline stage (matches prototype/seed for new records). */
function initialStage(status: string): string {
  return status === 'Closed' ? 'Closed' : status === 'On Hold' ? 'On Hold' : 'R0 · Sourcing';
}

export function toHdisDto(h: HdisDetail) {
  const detailsComplete = isDetailComplete(h.detail, h.attachments.length > 0);
  return {
    jdId: h.jdId,
    title: h.title,
    client: h.client,
    type: h.type,
    openings: h.openings,
    status: h.status,
    statusReason: h.statusReason,
    remarks: h.remarks,
    priority: h.priority,
    confidence: h.confidence,
    reqDate: h.reqDate,
    jdLink: h.jdLink,
    detailsComplete,
    requirementDetail: h.detail
      ? {
          bigMemberName: h.detail.bigMemberName,
          requirementsReceived: h.detail.requirementsReceived,
          requirementName: h.detail.requirementName,
          engagementType: h.detail.engagementType,
          clientType: h.detail.clientType,
          roleBackground: h.detail.roleBackground,
          positionOpenDuration: h.detail.positionOpenDuration,
          hiringDeadline: h.detail.hiringDeadline,
          interviewRoundsCount: h.detail.interviewRoundsCount,
          interviewRoundsDefinition: h.detail.interviewRoundsDefinition,
          positionsAlreadyFilled: h.detail.positionsAlreadyFilled,
          clientAttemptedInternalHiring: h.detail.clientAttemptedInternalHiring,
          internalHiringDuration: h.detail.internalHiringDuration,
          internalHiringChannels: h.detail.internalHiringChannels,
          internalHiringStageReached: h.detail.internalHiringStageReached,
          internalHiringChallenges: h.detail.internalHiringChallenges,
          ctcBlockerGap: h.detail.ctcBlockerGap,
          maxNoticePeriod: h.detail.maxNoticePeriod,
          targetCompaniesSuggested: h.detail.targetCompaniesSuggested,
          vayuzExclusive: h.detail.vayuzExclusive,
          vendorCount: h.detail.vendorCount,
          vendorsSharingProfiles: h.detail.vendorsSharingProfiles,
          vendorSubmissionDuration: h.detail.vendorSubmissionDuration,
          duplicateProfileTimeline: h.detail.duplicateProfileTimeline,
          commercialRates: h.detail.commercialRates,
          clientPocDetails: h.detail.clientPocDetails,
          additionalInsights: h.detail.additionalInsights,
          closureConfidence: h.detail.closureConfidence,
          exceptionNotes: h.detail.exceptionNotes,
          atsUsed: h.detail.atsUsed,
          isComplete: h.detail.isComplete,
        }
      : null,
    owners: h.owners.map((o) => o.consultantOrName),
    pipeline: h.pipeline
      ? {
          r0: h.pipeline.r0,
          r1: h.pipeline.r1,
          r2: h.pipeline.r2,
          r3: h.pipeline.r3,
          r4: h.pipeline.r4,
          r5: h.pipeline.r5,
          stage: h.pipeline.stage,
        }
      : null,
    attachments: h.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
      at: a.at.toISOString(),
    })),
    aging: computeAging(
      h.reqDate,
      h.stageEvents.map((e) => ({ stage: e.stage, at: e.at })),
      new Date(),
      isClosedRecord(h.status, h.pipeline?.r5 ?? 0),
    ),
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

async function logActivity(
  tx: Prisma.TransactionClient | PrismaClient,
  jdId: string,
  actorId: string,
  action: string,
  detail: string,
) {
  await tx.hdisActivity.create({ data: { jdId, actorId, action, detail } });
}

/**
 * Visibility filter for the HDIS module: org-scope roles (and anyone individually
 * granted the `hdis:view_all` override — see users/service.ts's `hdisFullAccess`
 * flag) see every record. Everyone else only sees records where they, or a teammate
 * within their reporting scope, are listed as an owner — matched by display name
 * since `HdisOwner.consultantOrName` is free text rather than a user FK.
 */
async function visibilityWhere(
  prisma: PrismaClient,
  user: CurrentUser,
): Promise<Prisma.HdisWhereInput> {
  if (user.role.scope === 'org' || can(user, 'hdis', 'view_all')) return {};
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  return { owners: { some: { consultantOrName: { in: [...names] } } } };
}

// Statuses that mean "this requirement is done" — once here, it no longer carries
// forward into later months just because it's still sitting in the system.
const TERMINAL_STATUSES = ['Fulfilled', 'Closed'];

export async function listHdis(
  prisma: PrismaClient,
  user: CurrentUser,
  filter: { month?: string; status?: string; q?: string },
) {
  const scoped = await visibilityWhere(prisma, user);
  const narrowed: Prisma.HdisWhereInput = {};
  if (filter.month) {
    // A requirement raised in an earlier month but still open (not Fulfilled/Closed)
    // should keep showing up when the user filters to the current month — otherwise
    // it silently drops off the list the moment the calendar turns over, even though
    // nobody has closed it. So "in this month" now means: raised in this month, OR
    // raised earlier and still open.
    narrowed.OR = [
      { reqDate: { gte: `${filter.month}-01`, lte: `${filter.month}-31` } },
      { reqDate: { lt: `${filter.month}-01` }, status: { notIn: TERMINAL_STATUSES } },
    ];
  }
  if (filter.status) narrowed.status = filter.status;
  // filter.q narrows title/client/jdId within whatever the month/status filters already
  // matched — kept as its own AND branch so it doesn't clobber the OR built above for
  // the month carry-forward.
  const search: Prisma.HdisWhereInput | undefined = filter.q
    ? {
        OR: [
          { title: { contains: filter.q, mode: 'insensitive' } },
          { client: { contains: filter.q, mode: 'insensitive' } },
          { jdId: { contains: filter.q, mode: 'insensitive' } },
        ],
      }
    : undefined;
  const rows = await prisma.hdis.findMany({
    where: { AND: [scoped, narrowed, ...(search ? [search] : [])] },
    include: detailInclude,
    orderBy: { reqDate: 'desc' },
  });
  return rows.map(toHdisDto);
}

export async function getHdis(prisma: PrismaClient, jdId: string) {
  const h = await prisma.hdis.findUnique({ where: { jdId }, include: detailInclude });
  if (!h) throw new NotFoundError('HDIS record not found');
  return h;
}

/** Same as `getHdis`, but 403s if the record falls outside the caller's HDIS visibility. */
export async function getHdisForUser(prisma: PrismaClient, user: CurrentUser, jdId: string) {
  const h = await getHdis(prisma, jdId);
  if (user.role.scope !== 'org' && !can(user, 'hdis', 'view_all')) {
    const directory = await loadDirectory(prisma);
    const names = scopeNames(user, directory);
    const visible = h.owners.some((o) => names.has(o.consultantOrName));
    if (!visible) {
      throw new ForbiddenError('You do not have access to this HDIS record', 'forbidden');
    }
  }
  return h;
}

/**
 * Gate for the record-level "update" actions (edit fields, pipeline, JD link,
 * attachments): allowed with blanket `hdis:edit`, or if the caller is personally
 * listed as an owner of this specific record — lets a consultant maintain the
 * client requirements they own without needing org-wide edit rights.
 */
export async function assertCanEditHdisRecord(
  prisma: PrismaClient,
  user: CurrentUser,
  jdId: string,
): Promise<void> {
  if (can(user, 'hdis', 'edit')) return;
  const h = await getHdis(prisma, jdId);
  const isOwner = h.owners.some((o) => o.consultantOrName === user.name);
  if (!isOwner) {
    throw new ForbiddenError('You can only update HDIS records you own', 'forbidden');
  }
}

export async function createHdis(prisma: PrismaClient, actorId: string, input: CreateHdisInput) {
  const existing = await prisma.hdis.findUnique({ where: { jdId: input.jdId } });
  if (existing) throw new ConflictError('A HDIS record with that JD id already exists', 'jd_taken');

  const created = await prisma.$transaction(async (tx) => {
    await ensureClient(tx, input.client);
    await tx.hdis.create({
      data: {
        jdId: input.jdId,
        title: input.title,
        client: input.client,
        type: input.type as HdisType,
        openings: input.openings,
        // Every requirement is born "Pending" — it can only move to "Active" once its
        // questionnaire (HdisRequirementDetail) is complete. See updateHdis() below.
        status: 'Pending',
        statusReason: input.statusReason ?? null,
        remarks: input.remarks ?? null,
        priority: input.priority,
        confidence: input.confidence,
        reqDate: input.reqDate,
        jdLink: input.jdLink ?? null,
      },
    });
    if (input.owners.length) {
      await tx.hdisOwner.createMany({
        data: input.owners.map((consultantOrName) => ({ jdId: input.jdId, consultantOrName })),
      });
    }
    await tx.hdisPipeline.create({
      data: { jdId: input.jdId, stage: initialStage('Pending') },
    });
    await logActivity(tx, input.jdId, actorId, 'create', `Created ${input.title} (${input.jdId})`);
    return tx.hdis.findUniqueOrThrow({ where: { jdId: input.jdId }, include: detailInclude });
  });
  return toHdisDto(created);
}

export async function updateHdis(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  input: UpdateHdisInput,
) {
  const current = await getHdis(prisma, jdId);
  if (input.status === 'Active' && current.status !== 'Active') {
    const complete = isDetailComplete(current.detail, current.attachments.length > 0);
    if (!complete) {
      throw new BadRequestError(
        'Complete the requirement questionnaire before activating this record',
        'details_incomplete',
      );
    }
  }
  const diffs: string[] = [];
  const data: Prisma.HdisUpdateInput = {};
  const scalarFields: (keyof UpdateHdisInput)[] = [
    'title',
    'client',
    'type',
    'openings',
    'status',
    'statusReason',
    'remarks',
    'priority',
    'confidence',
    'reqDate',
  ];
  for (const f of scalarFields) {
    const next = input[f];
    if (next !== undefined && next !== (current as Record<string, unknown>)[f]) {
      diffs.push(`${f}: ${(current as Record<string, unknown>)[f]} → ${next}`);
      (data as Record<string, unknown>)[f] = next;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (typeof data.client === 'string') await ensureClient(tx, data.client);
    if (Object.keys(data).length) await tx.hdis.update({ where: { jdId }, data });
    if (input.owners) {
      const before = current.owners.map((o) => o.consultantOrName).sort();
      const after = [...input.owners].sort();
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push(`owners: [${before.join(', ')}] → [${after.join(', ')}]`);
        await tx.hdisOwner.deleteMany({ where: { jdId } });
        if (input.owners.length) {
          await tx.hdisOwner.createMany({
            data: input.owners.map((consultantOrName) => ({ jdId, consultantOrName })),
          });
        }
      }
    }
    if (diffs.length) await logActivity(tx, jdId, actorId, 'edit', diffs.join('; '));
    return tx.hdis.findUniqueOrThrow({ where: { jdId }, include: detailInclude });
  });
  return toHdisDto(updated);
}

export async function deleteHdis(prisma: PrismaClient, _actorId: string, jdId: string) {
  await getHdis(prisma, jdId);
  // Cascades remove owners/pipeline/attachments/activity for this JD.
  await prisma.hdis.delete({ where: { jdId } });
}

export async function setPipeline(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  input: PipelineInput,
) {
  const current = await getHdis(prisma, jdId);
  const prev = current.pipeline;
  const changes: string[] = [];
  const stages: (keyof PipelineInput)[] = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];
  for (const s of stages) {
    const before = prev ? (prev[s as keyof typeof prev] as number) : 0;
    if (before !== input[s]) changes.push(`${s.toUpperCase()} ${before}→${input[s]}`);
  }
  const prevStage = prev?.stage;
  if (prevStage !== input.stage) changes.push(`stage ${prevStage ?? '—'}→${input.stage}`);

  let nextStatus = statusForStage(input.stage);
  // A "Pending" record can still have its pipeline worked on (sourcing, etc.), but
  // recording progress must not silently promote it to "Active" behind the
  // questionnaire gate — that's a deliberate action via updateHdis(), not a side
  // effect of logging R0-R5 counts. Any other stage transition (On Hold/Closed) is
  // unaffected since those aren't gated.
  if (nextStatus === 'Active' && current.status === 'Pending') {
    const complete = isDetailComplete(current.detail, current.attachments.length > 0);
    if (!complete) nextStatus = 'Pending';
  }

  // "Profile aging" input: the first time each stage's headcount goes from 0 to
  // positive. Recorded once per jdId+stage (unique constraint), inside this same
  // transaction, so it can never drift from the pipeline numbers it's derived from.
  const newlyReached = stages.filter((s) => {
    const before = prev ? (prev[s as keyof typeof prev] as number) : 0;
    return before === 0 && (input[s] as number) > 0;
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.hdisPipeline.upsert({
      where: { jdId },
      update: {
        r0: input.r0,
        r1: input.r1,
        r2: input.r2,
        r3: input.r3,
        r4: input.r4,
        r5: input.r5,
        stage: input.stage,
      },
      create: { jdId, ...input },
    });
    for (const s of newlyReached) {
      await tx.hdisStageEvent.upsert({
        where: { jdId_stage: { jdId, stage: s.toUpperCase() } },
        update: {}, // already recorded — keep the original (earliest) timestamp
        create: { jdId, stage: s.toUpperCase() },
      });
    }
    if (current.status !== nextStatus) {
      await tx.hdis.update({ where: { jdId }, data: { status: nextStatus } });
    }
    await logActivity(tx, jdId, actorId, 'pipeline update', changes.join(', ') || 'no change');
    return tx.hdis.findUniqueOrThrow({ where: { jdId }, include: detailInclude });
  });
  return toHdisDto(updated);
}

export async function setLink(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  jdLink: string | null,
) {
  await getHdis(prisma, jdId);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.hdis.update({ where: { jdId }, data: { jdLink } });
    await logActivity(tx, jdId, actorId, 'link', jdLink ? `Set JD link` : 'Cleared JD link');
    return tx.hdis.findUniqueOrThrow({ where: { jdId }, include: detailInclude });
  });
  return toHdisDto(updated);
}

/**
 * Save (upsert) the requirement questionnaire — every field is optional so this can be
 * called as a partial "save draft", any number of times, before all required fields are
 * present. `isComplete` is recomputed from REQUIRED_DETAIL_FIELDS + attachments on every
 * save, which is what unlocks the "Active" status in updateHdis()/setPipeline() above.
 */
export async function saveRequirementDetail(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  input: RequirementDetailInput,
) {
  const current = await getHdis(prisma, jdId);
  const merged = { ...current.detail, ...input };
  const complete = isDetailComplete(merged, current.attachments.length > 0);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.hdisRequirementDetail.upsert({
      where: { jdId },
      update: { ...input, isComplete: complete },
      create: { jdId, ...input, isComplete: complete },
    });
    await logActivity(
      tx,
      jdId,
      actorId,
      'requirement_detail',
      complete ? 'Saved requirement details (complete)' : 'Saved requirement details (draft)',
    );
    return tx.hdis.findUniqueOrThrow({ where: { jdId }, include: detailInclude });
  });
  return toHdisDto(updated);
}

/** Fetch just the requirement-detail record (used by the frontend to prefill the
 * questionnaire form) — 404s the same way getHdis() does if the JD itself doesn't exist. */
export async function getRequirementDetail(prisma: PrismaClient, jdId: string) {
  const h = await getHdis(prisma, jdId);
  return h.detail;
}

function toCandidateDto(c: {
  id: string;
  jdId: string;
  name: string;
  techStack: string | null;
  ownerName: string;
  stage: string;
  status: string;
  dropReason: string | null;
  submittedAt: string;
  offeredAt: string | null;
  closedAt: string | null;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    jdId: c.jdId,
    name: c.name,
    techStack: c.techStack,
    ownerName: c.ownerName,
    stage: c.stage,
    status: c.status,
    dropReason: c.dropReason,
    submittedAt: c.submittedAt,
    offeredAt: c.offeredAt,
    closedAt: c.closedAt,
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Today as an ISO YYYY-MM-DD string — used to auto-fill closedAt when a candidate is
 * marked Joined/Dropped without the caller specifying an exact date. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shared validation for create/update: a "Dropped" candidate must say why, and both
 * terminal statuses (Joined/Dropped) need a closedAt for turnaround-time math — default
 * it to today if the caller didn't supply one. Mutates and returns the merged fields. */
function normalizeCandidateFields<
  T extends { status?: string; dropReason?: string | null; closedAt?: string | null },
>(fields: T): T {
  if (fields.status === 'Dropped' && !fields.dropReason) {
    throw new BadRequestError('Add a reason for the drop', 'drop_reason_required');
  }
  if ((fields.status === 'Dropped' || fields.status === 'Joined') && !fields.closedAt) {
    fields.closedAt = todayIso();
  }
  return fields;
}

export async function listCandidates(prisma: PrismaClient, jdId: string) {
  await getHdis(prisma, jdId);
  const rows = await prisma.hdisCandidate.findMany({
    where: { jdId },
    orderBy: { submittedAt: 'desc' },
  });
  return rows.map(toCandidateDto);
}

export async function createCandidate(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  input: CreateCandidateInput,
) {
  await getHdis(prisma, jdId);
  const fields = normalizeCandidateFields({ ...input });
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.hdisCandidate.create({ data: { jdId, ...fields } });
    await logActivity(tx, jdId, actorId, 'candidate', `Added candidate "${c.name}" (${c.stage})`);
    return c;
  });
  return toCandidateDto(created);
}

export async function updateCandidate(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  candidateId: string,
  input: UpdateCandidateInput,
) {
  const existing = await prisma.hdisCandidate.findFirst({ where: { id: candidateId, jdId } });
  if (!existing) throw new NotFoundError('Candidate not found');
  const fields = normalizeCandidateFields({
    status: existing.status,
    dropReason: existing.dropReason,
    closedAt: existing.closedAt,
    ...input,
  });
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.hdisCandidate.update({ where: { id: candidateId }, data: fields });
    await logActivity(
      tx,
      jdId,
      actorId,
      'candidate',
      `Updated candidate "${c.name}" (${c.stage}/${c.status})`,
    );
    return c;
  });
  return toCandidateDto(updated);
}

export async function deleteCandidate(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  candidateId: string,
) {
  const existing = await prisma.hdisCandidate.findFirst({ where: { id: candidateId, jdId } });
  if (!existing) throw new NotFoundError('Candidate not found');
  await prisma.$transaction(async (tx) => {
    await tx.hdisCandidate.delete({ where: { id: candidateId } });
    await logActivity(tx, jdId, actorId, 'candidate', `Removed candidate "${existing.name}"`);
  });
}

export async function addAttachment(
  prisma: PrismaClient,
  actorId: string,
  jdId: string,
  file: { buffer: Buffer; fileName: string; contentType: string },
) {
  await getHdis(prisma, jdId);
  if (!ALLOWED_UPLOAD_MIME.has(file.contentType)) {
    throw new BadRequestError('Only PDF and Word documents are allowed', 'bad_mime');
  }
  const max = getConfig().MAX_UPLOAD_BYTES;
  if (file.buffer.length > max) {
    throw new BadRequestError('File exceeds the maximum allowed size', 'too_large');
  }
  const storage = getStorage();
  const stored = await storage.put(file.buffer, file.fileName);
  const attachment = await prisma.$transaction(async (tx) => {
    const a = await tx.hdisAttachment.create({
      data: {
        jdId,
        fileName: file.fileName,
        storageKey: stored.storageKey,
        contentType: file.contentType,
        size: stored.size,
        uploadedBy: actorId,
      },
    });
    await logActivity(tx, jdId, actorId, 'attachment', `Uploaded ${file.fileName}`);
    return a;
  });
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    at: attachment.at.toISOString(),
  };
}

export async function getAttachment(prisma: PrismaClient, jdId: string, attachmentId: string) {
  const a = await prisma.hdisAttachment.findFirst({ where: { id: attachmentId, jdId } });
  if (!a) throw new NotFoundError('Attachment not found');
  const buffer = await getStorage().get(a.storageKey);
  return { buffer, fileName: a.fileName, contentType: a.contentType };
}

export async function listActivity(prisma: PrismaClient, jdId: string) {
  await getHdis(prisma, jdId);
  const rows = await prisma.hdisActivity.findMany({
    where: { jdId },
    include: { actor: { select: { name: true } } },
    orderBy: { at: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    actor: r.actor.name,
    at: r.at.toISOString(),
  }));
}
