import type { Me } from './types';

/** Client-side permission check (server remains the source of truth). */
export function can(me: Me | null | undefined, section: string, capability: string): boolean {
  if (!me) return false;
  return me.permissions[section]?.includes(capability) ?? false;
}

export interface NavItem {
  key: string;
  label: string;
  path: string;
  section: string;
  /** Capability required to see this item; defaults to 'view'. */
  capability?: string;
  icon: string;
  group: 'Workspace' | 'Admin';
  /** Optional extra gate beyond the section/capability check (e.g. scope-based). */
  extraVisible?: (me: Me) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', path: '/', section: 'home', icon: '⌂', group: 'Workspace' },
  {
    key: 'interviews',
    label: 'Interviews',
    path: '/interviews',
    section: 'interviews',
    icon: '▦',
    group: 'Workspace',
  },
  { key: 'hdis', label: 'HDIS', path: '/hdis', section: 'hdis', icon: '▤', group: 'Workspace' },
  {
    key: 'myteam',
    label: 'My Team',
    path: '/team',
    section: 'myteam',
    icon: '◎',
    group: 'Workspace',
    // Org scope (Super Admin/HR) always sees the full PPG roster here — that's not a
    // "team" of theirs, so this stays visible for them regardless of reportees. For
    // everyone else, the page is only useful if they actually manage someone.
    extraVisible: (me) => me.scope === 'org' || !!me.hasReports,
  },
  {
    key: 'profile',
    label: 'Profile',
    path: '/profile',
    section: 'profile',
    icon: '●',
    group: 'Workspace',
  },
  {
    key: 'users',
    label: 'Users',
    path: '/admin/users',
    section: 'users',
    icon: '◈',
    group: 'Admin',
  },
  {
    key: 'roles',
    label: 'Roles & Access',
    path: '/admin/roles',
    section: 'roles',
    icon: '◆',
    group: 'Admin',
  },
  {
    key: 'hierarchy',
    label: 'Team Hierarchy',
    path: '/admin/hierarchy',
    section: 'hierarchy',
    icon: '⧉',
    group: 'Admin',
  },
  {
    key: 'clients',
    label: 'Clients',
    path: '/admin/clients',
    section: 'hdis',
    // Reuses the 'hdis' permission section: gated on 'edit' (org-scope roles) rather
    // than 'add', since consultants now also have hdis:add (to log their own JDs) but
    // shouldn't get the standalone client-master admin screen — they can still add a
    // brand-new client inline from the HDIS form itself (ensureClient on create/edit).
    capability: 'edit',
    icon: '🏢',
    group: 'Admin',
  },
  {
    key: 'auditlog',
    label: 'Activity Log',
    path: '/admin/audit-log',
    section: 'auditlog',
    icon: '☰',
    group: 'Admin',
  },
];

/** Nav items the user may view. */
export function visibleNav(me: Me | null): NavItem[] {
  return NAV_ITEMS.filter(
    (n) =>
      can(me, n.section, n.capability ?? 'view') && (!me || !n.extraVisible || n.extraVisible(me)),
  );
}
