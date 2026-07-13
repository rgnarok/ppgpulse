import type { Prisma } from '@prisma/client';

type UserWithRole = Prisma.UserGetPayload<{
  include: { role: true; overrides: true; manager: true };
}>;

/** Safe user DTO — never exposes passwordHash. */
export function toUserDto(u: UserWithRole) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    team: u.team,
    isActive: u.isActive,
    managerId: u.managerId,
    managerName: u.manager?.name ?? null,
    role: { key: u.role.key, label: u.role.label, scope: u.role.scope },
    overrides: u.overrides.map((o) => ({ section: o.section, capability: o.capability })),
    createdAt: u.createdAt.toISOString(),
  };
}
