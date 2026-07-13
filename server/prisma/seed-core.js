import argon2 from 'argon2';
function stageForStatus(status) {
    return status === 'Closed' ? 'Closed' : status === 'On Hold' ? 'On Hold' : 'R0 · Sourcing';
}
/**
 * Idempotent seed. Safe to run repeatedly: everything is upserted on its
 * natural key (role.key, user.id, consultant.userId, requirement.code, hdis.jdId).
 * Requirement owners are resolved by consultant display name.
 */
export async function seedDatabase(prisma, data) {
    const passwordHash = await argon2.hash(data.devPassword);
    // --- Roles + permissions ---
    const roleIdByKey = new Map();
    for (const r of data.roles) {
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
    // --- Users (two passes so manager FKs resolve) ---
    for (const u of data.users) {
        const roleId = roleIdByKey.get(u.role);
        if (!roleId)
            throw new Error(`Unknown role "${u.role}" for user ${u.email}`);
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
    const consultantIdByName = new Map();
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
        if (name)
            consultantIdByName.set(name, consultant.id);
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
                type: h.type,
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
                type: h.type,
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
        if (!ownerId)
            throw new Error(`Requirement ${r.code}: no consultant named "${r.owner}"`);
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
//# sourceMappingURL=seed-core.js.map