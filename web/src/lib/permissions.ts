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
  icon: string;
  group: 'Workspace' | 'Admin';
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
];

/** Nav items the user may view. */
export function visibleNav(me: Me | null): NavItem[] {
  return NAV_ITEMS.filter((n) => can(me, n.section, 'view'));
}
