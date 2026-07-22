import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { CreateKpiInput, UpdateKpiInput } from './schema.js';

export async function listKpis(prisma: PrismaClient) {
  return prisma.kpi.findMany({ orderBy: { kpiNo: 'asc' } });
}

export async function createKpi(prisma: PrismaClient, input: CreateKpiInput) {
  const clash = await prisma.kpi.findUnique({ where: { kpiNo: input.kpiNo } });
  if (clash) throw new ConflictError('A KPI with this KPI No. already exists', 'duplicate_kpi');
  return prisma.kpi.create({ data: input });
}

export async function updateKpi(prisma: PrismaClient, id: string, input: UpdateKpiInput) {
  const current = await prisma.kpi.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('KPI not found', 'kpi_not_found');
  if (input.kpiNo !== current.kpiNo) {
    const clash = await prisma.kpi.findUnique({ where: { kpiNo: input.kpiNo } });
    if (clash) throw new ConflictError('A KPI with this KPI No. already exists', 'duplicate_kpi');
  }
  return prisma.kpi.update({ where: { id }, data: input });
}

export async function deleteKpi(prisma: PrismaClient, id: string) {
  const current = await prisma.kpi.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('KPI not found', 'kpi_not_found');
  await prisma.kpi.delete({ where: { id } });
}
