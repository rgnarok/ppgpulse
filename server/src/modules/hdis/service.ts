import type { Prisma, PrismaClient, HdisType } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { getStorage, ALLOWED_UPLOAD_MIME } from '../../lib/storage.js';
import { getConfig } from '../../config.js';
import { ensureClient } from '../clients/service.js';
import type { CreateHdisInput, UpdateHdisInput, PipelineInput } from './schema.js';

const detailInclude = {
  owners: true,
  pipeline: true,
  attachments: { orderBy: { at: 'desc' } },
} as const satisfies Prisma.HdisInclude;

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
  return {
    jdId: h.jdId,
    title: h.title,
    client: h.client,
    type: h.type,
    openings: h.openings,
    status: h.status,
    priority: h.priority,
    confidence: h.confidence,
    reqDate: h.reqDate,
    jdLink: h.jdLink,
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

export async function listHdis(
  prisma: PrismaClient,
  filter: { month?: string; status?: string; q?: string },
) {
  const where: Prisma.HdisWhereInput = {};
  if (filter.month) {
    where.reqDate = { gte: `${filter.month}-01`, lte: `${filter.month}-31` };
  }
  if (filter.status) where.status = filter.status;
  if (filter.q) {
    where.OR = [
      { title: { contains: filter.q, mode: 'insensitive' } },
      { client: { contains: filter.q, mode: 'insensitive' } },
      { jdId: { contains: filter.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.hdis.findMany({
    where,
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
        status: input.status,
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
      data: { jdId: input.jdId, stage: initialStage(input.status) },
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
  const diffs: string[] = [];
  const data: Prisma.HdisUpdateInput = {};
  const scalarFields: (keyof UpdateHdisInput)[] = [
    'title',
    'client',
    'type',
    'openings',
    'status',
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

  const nextStatus = statusForStage(input.stage);

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
