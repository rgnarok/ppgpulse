import type { PrismaClient } from '@prisma/client';

export interface OrgNode {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
  reports: OrgNode[];
}

/** Build the reporting tree (roots = users with no manager). Cycle-safe. */
export async function orgTree(prisma: PrismaClient): Promise<OrgNode[]> {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { name: 'asc' },
  });
  const nodes = new Map<string, OrgNode>();
  for (const u of users) {
    nodes.set(u.id, {
      id: u.id,
      name: u.name,
      email: u.email,
      team: u.team,
      role: u.role.key,
      reports: [],
    });
  }
  const roots: OrgNode[] = [];
  const seen = new Set<string>();
  for (const u of users) {
    const node = nodes.get(u.id)!;
    const parent = u.managerId ? nodes.get(u.managerId) : undefined;
    // Guard against a self/broken parent or an already-placed node.
    if (parent && u.managerId !== u.id && !seen.has(u.id)) {
      parent.reports.push(node);
    } else {
      roots.push(node);
    }
    seen.add(u.id);
  }
  return roots;
}
