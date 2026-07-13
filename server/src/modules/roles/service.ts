import type { Prisma, PrismaClient } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { assertCanEditRole, type CurrentUser } from '../rbac/index.js';
import type { CreateRoleInput, UpdateRoleInput } from './schema.js';

type RoleWithPerms = Prisma.RoleGetPayload<{ include: { permissions: true } }>;

export function toRoleDto(role: RoleWithPerms, userCount: number) {
  const permissions: Record<string, string[]> = {};
  for (const p of role.permissions) (permissions[p.section] ??= []).push(p.capability);
  return {
    id: role.id,
    key: role.key,
    label: role.label,
    sub: role.sub,
    scope: role.scope,
    isSystem: role.isSystem,
    isProtected: role.isProtected,
    permissions,
    userCount,
  };
}

async function withCount(prisma: PrismaClient, role: RoleWithPerms) {
  const userCount = await prisma.user.count({ where: { roleId: role.id } });
  return toRoleDto(role, userCount);
}

export async function listRoles(prisma: PrismaClient) {
  const roles = await prisma.role.findMany({
    include: { permissions: true },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(roles.map((r) => withCount(prisma, r)));
}

async function replacePermissions(
  tx: Prisma.TransactionClient,
  roleId: string,
  permissions: Record<string, string[]>,
) {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  const rows: { roleId: string; section: string; capability: string }[] = [];
  for (const [section, caps] of Object.entries(permissions)) {
    for (const capability of caps) rows.push({ roleId, section, capability });
  }
  if (rows.length) await tx.rolePermission.createMany({ data: rows });
}

export async function createRole(prisma: PrismaClient, actor: CurrentUser, input: CreateRoleInput) {
  // A newly-created role is non-system/non-protected.
  assertCanEditRole(actor, { isSystem: false, isProtected: false });
  const existing = await prisma.role.findUnique({ where: { key: input.key } });
  if (existing) throw new ConflictError('Role key already exists', 'role_key_taken');

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        key: input.key,
        label: input.label,
        sub: input.sub,
        scope: input.scope,
        isSystem: false,
        isProtected: false,
      },
    });
    await replacePermissions(tx, created.id, input.permissions);
    return tx.role.findUniqueOrThrow({ where: { id: created.id }, include: { permissions: true } });
  });
  return withCount(prisma, role);
}

export async function updateRole(
  prisma: PrismaClient,
  actor: CurrentUser,
  id: string,
  input: UpdateRoleInput,
) {
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw new NotFoundError('Role not found');
  assertCanEditRole(actor, role);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        label: input.label ?? undefined,
        sub: input.sub ?? undefined,
        scope: input.scope ?? undefined,
      },
    });
    if (input.permissions) await replacePermissions(tx, id, input.permissions);
    return tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
  });
  return withCount(prisma, updated);
}

export async function deleteRole(prisma: PrismaClient, actor: CurrentUser, id: string) {
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw new NotFoundError('Role not found');
  assertCanEditRole(actor, role);
  if (role.isSystem || role.isProtected) {
    throw new BadRequestError('System/protected roles cannot be deleted', 'protected_role');
  }
  const fallback = await prisma.role.findUnique({ where: { key: 'consultant' } });
  if (!fallback) throw new BadRequestError('No fallback role to reassign users to');

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { roleId: id }, data: { roleId: fallback.id } });
    await tx.role.delete({ where: { id } });
  });
}
