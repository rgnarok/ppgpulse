import type { PrismaClient, HdisType } from '@prisma/client';
import argon2 from 'argon2';

export interface SeedRole {
  key: string;
  label: string;
  sub: string;
  scope: 'org' | 'team' | 'own';
  isSystem: boolean;
  isProtected: boolean;
  permissions: Record<string, string[]>;
}
export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  manager: string | null;
}
export interface SeedConsultant {
  userId: string;
  pod: string;
  eventsHosted: number;
  eventsParticipated: number;
  insights: number;
}
export interface SeedRequirement {
  code: string;
  jdId: string | null;
  owner: string;
  title: string;
  client: string;
  reqDate: string;
  status: string;
  profiles: number;
  shortlist: number;
  l1: number;
  l2: number;
  l3: number;
  onboard: number;
}
export interface SeedHdis {
  jdId: string;
  title: string;
  client: string;
  type: string;
  openings: number;
  status: string;
  reqDate: string;
  owners: string[];
  priority?: string;
  confidence?: string;
  pipeline?: { r0: number; r1: number; r2: number; r3: number; r4: number; r5: number };
  stage?: string;
}
export interface SeedData {
  devPassword: string;
  roles: SeedRole[];
  users: SeedUser[];
  consultants: SeedConsultant[];
  requirements: SeedRequirement[];
  hdis: SeedHdis[];
}

export interface SeedCounts {
  roles: number;
  users: number;
  consultants: number;
  requirements: number;
  hdis: number;
}

function stageForStatus(status: string): string {
  return status === 'Closed' ? 'Closed' : status === 'On Hold' ? 'On Hold' : 'R0 · Sourcing';
}

/** Role keys treated as "PPG people" — see matching constant in
 * server/src/modules/users/service.ts (kept in sync manually; small, fixed list). */
const PPG_ROLE_KEYS = ['consultant', 'hr_manager'];

/** Upsert all roles + their permissions. Idempotent; returns key -> id map. */
async function seedRoles(prisma: PrismaClient, roles: SeedRole[]): Promise<Map<string, string>> {
  const roleIdByKey = new Map<string, string>();
  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: {
        label: r.label,
        sub: r.sub,
        scope: r.scope,
        isSystem: r.isSystem,
        isProtected: r.isProtected,
      },
      create: {
        key: r.key,
        label: r.label,
        sub: r.sub,
        scope: r.scope,
        isSystem: r.isSystem,
        isProtected: r.isProtected,
      },
    });
    roleIdByKey.set(r.key, role.id);
    for (const [section, caps] of Object.entries(r.permissions)) {
      for (const capability of caps) {
        await prisma.rolePermission.upsert({
          where: { roleId_section_capability: { roleId: role.id, section, capability } },
          update: {},
          create: { roleId: role.id, section, capability },
        });
      }
    }
  }
  return roleIdByKey;
}

/**
 * Production baseline: ensure every role and every super_admin account exists,
 * WITHOUT loading the demo dataset. Safe to run on every boot — it upserts
 * roles + admins but never re-creates demo users/consultants/requirements, so
 * accounts an admin deletes in the UI stay deleted across restarts.
 */
export async function seedBaseline(
  prisma: PrismaClient,
  data: SeedData,
): Promise<{
  roles: number;
  admins: number;
  consultantsBackfilled: number;
  clientsBackfilled: number;
}> {
  // The bootstrap super_admin password is self-healing: on every boot we (re)set
  // it to SUPER_ADMIN_PASSWORD (if provided on the host) or the built-in default,
  // so a redeploy always yields a known, working login for the founder account.
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || data.devPassword;
  const passwordHash = await argon2.hash(adminPassword);
  const roleIdByKey = await seedRoles(prisma, data.roles);

  const admins = data.users.filter((u) => u.role === 'super_admin');
  for (const u of admins) {
    const roleId = roleIdByKey.get(u.role);
    if (!roleId) throw new Error(`Unknown role "${u.role}" for user ${u.email}`);
    await prisma.user.upsert({
      where: { id: u.id },
      // Ensure the account exists, keeps its admin role, is active, and has a
      // known password. We intentionally do NOT touch demo users here.
      update: { roleId, passwordHash, isActive: true, email: u.email },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        roleId,
        team: u.team,
        passwordHash,
        managerId: null,
      },
    });
  }

  // Backfill: PPG people (Consultants + HR Managers) who are missing their Consultant
  // profile — this happened for anyone created via the app before the Create User form
  // started provisioning one automatically, or for HR Managers created before they were
  // included in the PPG headcount. Without it they never show up in the team roster,
  // report charts, the PPG headcount tile, or the interview "Sourcing" picker.
  // Idempotent — only touches users with no existing profile.
  const missingConsultants = await prisma.user.findMany({
    where: { consultant: null, role: { key: { in: PPG_ROLE_KEYS } } },
    select: { id: true, team: true },
  });
  for (const u of missingConsultants) {
    await prisma.consultant.create({ data: { userId: u.id, pod: u.team } });
  }

  // Backfill: the Client master list is grown organically as HDIS records are
  // created/edited, so any client names already on existing Hdis rows (seeded, or
  // created before the master existed) need to be copied in once. Idempotent —
  // `client.name` is unique, so already-known names are simply skipped.
  const existingClients = new Set(
    (await prisma.client.findMany({ select: { name: true } })).map((c) => c.name),
  );
  const hdisClients = await prisma.hdis.findMany({
    select: { client: true },
    distinct: ['client'],
  });
  const newClientNames = hdisClients
    .map((h) => h.client.trim())
    .filter((name) => name && !existingClients.has(name));
  if (newClientNames.length) {
    await prisma.client.createMany({
      data: [...new Set(newClientNames)].map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  return {
    roles: await prisma.role.count(),
    admins: admins.length,
    consultantsBackfilled: missingConsultants.length,
    clientsBackfilled: newClientNames.length,
  };
}

/**
 * Idempotent seed. Safe to run repeatedly: everything is upserted on its
 * natural key (role.key, user.id, consultant.userId, requirement.code, hdis.jdId).
 * Requirement owners are resolved by consultant display name.
 */
export async function seedDatabase(prisma: PrismaClient, data: SeedData): Promise<SeedCounts> {
  const passwordHash = await argon2.hash(data.devPassword);

  // --- Roles + permissions ---
  const roleIdByKey = await seedRoles(prisma, data.roles);

  // --- Users (two passes so manager FKs resolve) ---
  for (const u of data.users) {
    const roleId = roleIdByKey.get(u.role);
    if (!roleId) throw new Error(`Unknown role "${u.role}" for user ${u.email}`);
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, roleId, team: u.team, passwordHash },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        roleId,
        team: u.team,
        passwordHash,
        managerId: null,
      },
    });
  }
  for (const u of data.users) {
    await prisma.user.update({ where: { id: u.id }, data: { managerId: u.manager } });
  }

  // --- Consultants ---
  const consultantIdByName = new Map<string, string>();
  const userById = new Map(data.users.map((u) => [u.id, u]));
  for (const c of data.consultants) {
    const consultant = await prisma.consultant.upsert({
      where: { userId: c.userId },
      update: {
        pod: c.pod,
        eventsHosted: c.eventsHosted,
        eventsParticipated: c.eventsParticipated,
        insights: c.insights,
      },
      create: {
        userId: c.userId,
        pod: c.pod,
        eventsHosted: c.eventsHosted,
        eventsParticipated: c.eventsParticipated,
        insights: c.insights,
      },
    });
    const name = userById.get(c.userId)?.name;
    if (name) consultantIdByName.set(name, consultant.id);
  }
  // Any other PPG person (e.g. an HR Manager) not explicitly listed in `consultants`
  // still gets a zeroed profile, so they show up in the team roster and headcount tile.
  const roleByUserId = new Map(
    (await prisma.user.findMany({ select: { id: true, role: { select: { key: true } } } })).map(
      (u) => [u.id, u.role.key],
    ),
  );
  for (const u of data.users) {
    if (consultantIdByName.has(u.name)) continue;
    if (!PPG_ROLE_KEYS.includes(roleByUserId.get(u.id) ?? '')) continue;
    const consultant = await prisma.consultant.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, pod: u.team },
    });
    consultantIdByName.set(u.name, consultant.id);
  }

  // --- HDIS (before requirements: requirement.jdId -> hdis.jdId FK) ---
  for (const h of data.hdis) {
    const pipeline = h.pipeline ?? { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    const stage = h.stage ?? stageForStatus(h.status);
    await prisma.hdis.upsert({
      where: { jdId: h.jdId },
      update: {
        title: h.title,
        client: h.client,
        type: h.type as HdisType,
        openings: h.openings,
        status: h.status,
        priority: h.priority ?? 'NA',
        confidence: h.confidence ?? 'Medium',
        reqDate: h.reqDate,
      },
      create: {
        jdId: h.jdId,
        title: h.title,
        client: h.client,
        type: h.type as HdisType,
        openings: h.openings,
        status: h.status,
        priority: h.priority ?? 'NA',
        confidence: h.confidence ?? 'Medium',
        reqDate: h.reqDate,
      },
    });
    await prisma.hdisOwner.deleteMany({ where: { jdId: h.jdId } });
    if (h.owners.length) {
      await prisma.hdisOwner.createMany({
        data: h.owners.map((consultantOrName) => ({ jdId: h.jdId, consultantOrName })),
      });
    }
    await prisma.hdisPipeline.upsert({
      where: { jdId: h.jdId },
      update: { ...pipeline, stage },
      create: { jdId: h.jdId, ...pipeline, stage },
    });
  }

  // --- Requirements ---
  const hdisIds = new Set(data.hdis.map((h) => h.jdId));
  for (const r of data.requirements) {
    const ownerId = consultantIdByName.get(r.owner);
    if (!ownerId) throw new Error(`Requirement ${r.code}: no consultant named "${r.owner}"`);
    const jdId = r.jdId && hdisIds.has(r.jdId) ? r.jdId : null;
    const payload = {
      jdId,
      ownerId,
      title: r.title,
      client: r.client,
      reqDate: r.reqDate,
      status: r.status,
      profiles: r.profiles,
      shortlist: r.shortlist,
      l1: r.l1,
      l2: r.l2,
      l3: r.l3,
      onboard: r.onboard,
    };
    await prisma.requirement.upsert({
      where: { code: r.code },
      update: payload,
      create: { code: r.code, ...payload },
    });
  }

  return {
    roles: await prisma.role.count(),
    users: await prisma.user.count(),
    consultants: await prisma.consultant.count(),
    requirements: await prisma.requirement.count(),
    hdis: await prisma.hdis.count(),
  };
}
