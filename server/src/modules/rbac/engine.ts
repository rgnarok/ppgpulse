import { ForbiddenError } from '../../lib/errors.js';

export type Scope = 'org' | 'team' | 'own';
export const SECTIONS = [
  'home',
  'interviews',
  'hdis',
  'myteam',
  'profile',
  'users',
  'roles',
  'hierarchy',
] as const;
export type Section = (typeof SECTIONS)[number];
export type Capability = 'view' | 'add' | 'edit' | 'delete' | 'export';

export interface RbacRole {
  key: string;
  scope: Scope;
  isSystem: boolean;
  isProtected: boolean;
  /** section -> capabilities granted by the role */
  permissions: Record<string, string[]>;
}

export interface RbacOverride {
  section: string;
  capability: string;
}

export interface RbacUser {
  id: string;
  name: string;
  team: string;
  managerId: string | null;
  role: RbacRole;
  overrides: RbacOverride[];
}

/** A node in the org directory used for scope resolution. */
export interface DirectoryNode {
  id: string;
  name: string;
  team: string;
  managerId: string | null;
}

/** Effective permissions = role permissions ∪ user overrides. */
export function effectivePermissions(user: RbacUser): Record<string, string[]> {
  const merged: Record<string, Set<string>> = {};
  for (const [section, caps] of Object.entries(user.role.permissions)) {
    merged[section] ??= new Set();
    for (const c of caps) merged[section].add(c);
  }
  for (const o of user.overrides) {
    merged[o.section] ??= new Set();
    merged[o.section].add(o.capability);
  }
  const out: Record<string, string[]> = {};
  for (const [section, caps] of Object.entries(merged)) {
    out[section] = [...caps];
  }
  return out;
}

/** Does the user have `capability` on `section` (role ∪ overrides)? */
export function can(user: RbacUser, section: string, capability: string): boolean {
  if (user.role.permissions[section]?.includes(capability)) return true;
  return user.overrides.some((o) => o.section === section && o.capability === capability);
}

/** Throws ForbiddenError unless `can(...)`. */
export function assertCan(user: RbacUser, section: string, capability: string): void {
  if (!can(user, section, capability)) {
    throw new ForbiddenError(`Missing permission: ${section}.${capability}`, 'forbidden');
  }
}

/** Cycle-safe set of a user's report-tree descendant ids (excludes self). */
export function descendantIds(rootId: string, directory: DirectoryNode[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of directory) {
    if (n.managerId) {
      const list = childrenOf.get(n.managerId) ?? [];
      list.push(n.id);
      childrenOf.set(n.managerId, list);
    }
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id) || id === rootId) continue;
    out.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return out;
}

/**
 * User ids visible to `user` given its role scope:
 * - org  → everyone
 * - own  → just the user
 * - team → self + reporting subtree + same-team peers
 */
export function scopeUserIds(user: RbacUser, directory: DirectoryNode[]): Set<string> {
  if (user.role.scope === 'org') return new Set(directory.map((n) => n.id));
  if (user.role.scope === 'own') return new Set([user.id]);
  const ids = new Set<string>([user.id]);
  for (const d of descendantIds(user.id, directory)) ids.add(d);
  for (const n of directory) {
    if (n.team === user.team) ids.add(n.id);
  }
  return ids;
}

/** Display names visible to `user` (used to filter requirements/consultants by owner name). */
export function scopeNames(user: RbacUser, directory: DirectoryNode[]): Set<string> {
  const ids = scopeUserIds(user, directory);
  const names = new Set<string>();
  for (const n of directory) if (ids.has(n.id)) names.add(n.name);
  return names;
}

export function isSuperAdmin(role: { key: string }): boolean {
  return role.key === 'super_admin';
}
export function isHrManager(role: { key: string }): boolean {
  return role.key === 'hr_manager';
}

/**
 * HR-cannot-touch-super_admin guard. An hr_manager may not edit, delete,
 * change the role of, or reset the password of any super_admin user.
 * Super Admin can manage anyone.
 */
export function assertCanManageUser(actor: RbacUser, target: { role: { key: string } }): void {
  if (isSuperAdmin(actor.role)) return;
  if (isHrManager(actor.role)) {
    if (isSuperAdmin(target.role)) {
      throw new ForbiddenError('HR Managers cannot manage Super Admin accounts', 'protected_user');
    }
    return;
  }
  throw new ForbiddenError('Not permitted to manage users', 'forbidden');
}

/**
 * Role-editing guard: only super_admin may edit protected/system roles;
 * hr_manager may create/edit non-system roles.
 */
export function assertCanEditRole(
  actor: RbacUser,
  role: { isSystem: boolean; isProtected: boolean },
): void {
  if (isSuperAdmin(actor.role)) return;
  if (isHrManager(actor.role)) {
    if (role.isSystem || role.isProtected) {
      throw new ForbiddenError(
        'Only Super Admin may edit system/protected roles',
        'protected_role',
      );
    }
    return;
  }
  throw new ForbiddenError('Not permitted to edit roles', 'forbidden');
}
