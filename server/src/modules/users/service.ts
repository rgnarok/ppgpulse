import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../lib/password.js';
import { sendWelcomeEmail } from '../../lib/mailer.js';
import { getConfig } from '../../config.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { assertCanManageUser, descendantIds, SECTIONS, type CurrentUser } from '../rbac/index.js';
import type { CreateUserInput, UpdateUserInput } from './schema.js';

const userInclude = { role: true, overrides: true, manager: true } as const;

async function roleByKey(prisma: PrismaClient, key: string) {
  const role = await prisma.role.findUnique({ where: { key } });
  if (!role) throw new BadRequestError(`Unknown role "${key}"`, 'unknown_role');
  return role;
}

export function listUsers(prisma: PrismaClient) {
  return prisma.user.findMany({ include: userInclude, orderBy: { createdAt: 'asc' } });
}

export async function getUser(prisma: PrismaClient, id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function createUser(prisma: PrismaClient, actor: CurrentUser, input: CreateUserInput) {
  const role = await roleByKey(prisma, input.roleKey);
  // Guard: an HR Manager may not create a super_admin.
  assertCanManageUser(actor, { role: { key: role.key } });

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already in use', 'email_taken');

  if (input.managerId) await getUser(prisma, input.managerId);

  const plainPassword = input.password ?? 'Passw0rd!';
  const passwordHash = await hashPassword(plainPassword);
  // Per-user section access is granted as `view` overrides (role ∪ overrides).
  const sections = (input.sections ?? []).filter((s): s is (typeof SECTIONS)[number] =>
    (SECTIONS as readonly string[]).includes(s),
  );
  const overrideRows = sections.map((section) => ({ section, capability: 'view' }));
  // "Full HDIS access" bypasses the default owner-only scoping so this user can see
  // and update every client's records, not just the ones they're listed as owning.
  if (input.hdisFullAccess) {
    overrideRows.push({ section: 'hdis', capability: 'view_all' });
    overrideRows.push({ section: 'hdis', capability: 'edit' });
  }
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      roleId: role.id,
      team: input.team,
      managerId: input.managerId ?? null,
      passwordHash,
      overrides: overrideRows.length ? { create: overrideRows } : undefined,
      // Team-scope roles (e.g. Consultant) are PPG delivery staff tracked via a Consultant
      // profile — without this, new hires never show up in the consultant/team filters,
      // report charts, or the interview "Sourcing" picker.
      consultant: role.scope === 'team' ? { create: { pod: input.team } } : undefined,
    },
    include: userInclude,
  });

  // Optionally email the new user their own credentials. Best-effort: a failed
  // or unconfigured mail send must never fail account creation itself.
  let emailSent = false;
  if (input.emailCredentials) {
    try {
      emailSent = await sendWelcomeEmail({
        to: user.email,
        name: user.name,
        password: plainPassword,
        webOrigin: getConfig().WEB_ORIGIN,
      });
    } catch (err) {
      console.error('[users] failed to send welcome email', err);
      emailSent = false;
    }
  }

  return { user, emailSent };
}

export async function updateUser(
  prisma: PrismaClient,
  actor: CurrentUser,
  id: string,
  input: UpdateUserInput,
) {
  const target = await getUser(prisma, id);
  // Guard against the target's CURRENT role (e.g. HR editing a super_admin).
  assertCanManageUser(actor, { role: { key: target.role.key } });

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.team !== undefined) data.team = input.team;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (input.email !== undefined) {
    const email = input.email.toLowerCase().trim();
    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) throw new ConflictError('Email already in use', 'email_taken');
    }
    data.email = email;
  }

  let promotedToTeamScope = false;
  if (input.roleKey !== undefined) {
    const role = await roleByKey(prisma, input.roleKey);
    // Guard against the NEW role too (e.g. HR promoting someone to super_admin).
    assertCanManageUser(actor, { role: { key: role.key } });
    data.roleId = role.id;
    promotedToTeamScope = role.scope === 'team';
  }

  if (input.managerId !== undefined) {
    if (input.managerId === id) throw new BadRequestError('A user cannot manage themselves');
    if (input.managerId) await getUser(prisma, input.managerId);
    data.managerId = input.managerId;
  }

  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
  }

  const existingConsultant = await prisma.consultant.findUnique({ where: { userId: id } });
  const pod = input.team ?? target.team;
  if (existingConsultant) {
    // Keep the consultant's pod in sync with the user's team.
    if (input.team !== undefined && input.team !== existingConsultant.pod) {
      await prisma.consultant.update({ where: { userId: id }, data: { pod: input.team } });
    }
  } else if (promotedToTeamScope) {
    // Promoted into a team-scope role (e.g. made a Consultant) — give them a profile so
    // they show up in the consultant/team filters and reports, same as at creation time.
    await prisma.consultant.create({ data: { userId: id, pod } });
  }

  return prisma.user.update({ where: { id }, data, include: userInclude });
}

export async function deleteUser(prisma: PrismaClient, actor: CurrentUser, id: string) {
  const target = await getUser(prisma, id);
  assertCanManageUser(actor, { role: { key: target.role.key } });
  if (actor.id === id) throw new BadRequestError('You cannot delete your own account');
  // Reassign the deleted user's direct reports to the deleted user's manager.
  await prisma.user.updateMany({
    where: { managerId: id },
    data: { managerId: target.managerId },
  });
  await prisma.user.delete({ where: { id } });
}

/** Grant or revoke a single per-user permission override. */
export async function setOverride(
  prisma: PrismaClient,
  actor: CurrentUser,
  userId: string,
  section: string,
  capability: string,
  grant: boolean,
) {
  const target = await getUser(prisma, userId);
  assertCanManageUser(actor, { role: { key: target.role.key } });
  if (grant) {
    await prisma.userOverride.upsert({
      where: { userId_section_capability: { userId, section, capability } },
      update: {},
      create: { userId, section, capability },
    });
  } else {
    await prisma.userOverride.deleteMany({ where: { userId, section, capability } });
  }
  return getUser(prisma, userId);
}

/** Set a user's reporting line with a cycle guard (no self/descendant managers). */
export async function setManager(
  prisma: PrismaClient,
  actor: CurrentUser,
  userId: string,
  managerId: string | null,
) {
  const target = await getUser(prisma, userId);
  assertCanManageUser(actor, { role: { key: target.role.key } });

  if (managerId) {
    if (managerId === userId) throw new BadRequestError('A user cannot report to themselves');
    await getUser(prisma, managerId); // ensure exists
    const directory = await prisma.user.findMany({
      select: { id: true, name: true, team: true, managerId: true },
    });
    const descendants = descendantIds(userId, directory);
    if (descendants.has(managerId)) {
      throw new BadRequestError('That change would create a reporting cycle', 'reporting_cycle');
    }
  }

  return prisma.user.update({ where: { id: userId }, data: { managerId }, include: userInclude });
}
