import type { PrismaClient } from '@prisma/client';
import type { RbacUser, DirectoryNode, Scope } from './engine.js';

export interface CurrentUser extends RbacUser {
  email: string;
  isActive: boolean;
  roleLabel: string;
  roleSub: string;
  /** True if any other user reports up to this one — drives "My Team" visibility. */
  hasReports: boolean;
  consultant: {
    id: string;
    pod: string;
    eventsHosted: number;
    eventsParticipated: number;
    insights: number;
  } | null;
}

/** Load a fully-shaped RBAC user (role, permissions, overrides, consultant). */
export async function loadCurrentUser(
  prisma: PrismaClient,
  userId: string,
): Promise<CurrentUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: true } },
      overrides: true,
      consultant: true,
    },
  });
  if (!u) return null;

  const directReport = await prisma.user.findFirst({
    where: { managerId: u.id },
    select: { id: true },
  });

  const permissions: Record<string, string[]> = {};
  for (const p of u.role.permissions) {
    (permissions[p.section] ??= []).push(p.capability);
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    team: u.team,
    managerId: u.managerId,
    isActive: u.isActive,
    roleLabel: u.role.label,
    roleSub: u.role.sub,
    hasReports: !!directReport,
    role: {
      key: u.role.key,
      scope: u.role.scope as Scope,
      isSystem: u.role.isSystem,
      isProtected: u.role.isProtected,
      permissions,
    },
    overrides: u.overrides.map((o) => ({ section: o.section, capability: o.capability })),
    consultant: u.consultant
      ? {
          id: u.consultant.id,
          pod: u.consultant.pod,
          eventsHosted: u.consultant.eventsHosted,
          eventsParticipated: u.consultant.eventsParticipated,
          insights: u.consultant.insights,
        }
      : null,
  };
}

/** Load the org directory (all users) for scope resolution. */
export async function loadDirectory(prisma: PrismaClient): Promise<DirectoryNode[]> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, team: true, managerId: true },
  });
  return users;
}
