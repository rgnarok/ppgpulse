import { describe, it, expect } from 'vitest';
import {
  can,
  effectivePermissions,
  scopeNames,
  scopeUserIds,
  descendantIds,
  assertCanManageUser,
  assertCanEditRole,
  type RbacUser,
  type RbacRole,
  type DirectoryNode,
} from './engine.js';

const roles: Record<string, RbacRole> = {
  super_admin: {
    key: 'super_admin',
    scope: 'org',
    isSystem: true,
    isProtected: true,
    permissions: {
      home: ['view'],
      interviews: ['view', 'edit'],
      hdis: ['view', 'add', 'edit', 'delete'],
      myteam: ['view'],
      profile: ['view', 'edit'],
      users: ['view', 'edit'],
      roles: ['view', 'edit'],
      hierarchy: ['view', 'edit'],
    },
  },
  hr_manager: {
    key: 'hr_manager',
    scope: 'org',
    isSystem: true,
    isProtected: false,
    permissions: {
      home: ['view'],
      interviews: ['view', 'edit'],
      hdis: ['view', 'add', 'edit', 'delete'],
      myteam: ['view'],
      profile: ['view', 'edit'],
      users: ['view', 'edit'],
      roles: ['view', 'edit'],
      hierarchy: ['view', 'edit'],
    },
  },
  consultant: {
    key: 'consultant',
    scope: 'team',
    isSystem: true,
    isProtected: false,
    permissions: {
      home: ['view'],
      interviews: ['view', 'edit'],
      hdis: ['view'],
      myteam: ['view'],
      profile: ['view', 'edit'],
    },
  },
};

function user(roleKey: keyof typeof roles, extra: Partial<RbacUser> = {}): RbacUser {
  return {
    id: extra.id ?? 'u1',
    name: extra.name ?? 'User',
    team: extra.team ?? 'Pod A',
    managerId: extra.managerId ?? null,
    role: roles[roleKey],
    overrides: extra.overrides ?? [],
  };
}

// Directory mirroring the seed reporting structure (Pod A branch).
const directory: DirectoryNode[] = [
  { id: 'u_kb', name: 'Kushagra Bindra', team: 'Leadership', managerId: null },
  { id: 'u_aarti', name: 'Aarti Mehta', team: 'Leadership', managerId: 'u_kb' },
  { id: 'u_abha', name: 'Abha Sharma', team: 'Pod A', managerId: 'u_aarti' },
  { id: 'u_suhani', name: 'Suhani Singh', team: 'Pod A', managerId: 'u_abha' },
  { id: 'u_pragyashree', name: 'Pragyashree Jain', team: 'Pod A', managerId: 'u_abha' },
  { id: 'u_anshika', name: 'Anshika Rana', team: 'Pod A', managerId: 'u_abha' },
  { id: 'u_akansha', name: 'Akansha Singh', team: 'Pod B', managerId: 'u_aarti' },
];

describe('rbac matrix (SPEC §2)', () => {
  it('super_admin can do everything incl. hdis.delete and admin', () => {
    const u = user('super_admin');
    expect(can(u, 'hdis', 'delete')).toBe(true);
    expect(can(u, 'users', 'edit')).toBe(true);
    expect(can(u, 'roles', 'edit')).toBe(true);
    expect(can(u, 'hierarchy', 'edit')).toBe(true);
  });

  it('hr_manager mirrors super_admin permissions (guards handled separately)', () => {
    const u = user('hr_manager');
    expect(can(u, 'hdis', 'delete')).toBe(true);
    expect(can(u, 'users', 'edit')).toBe(true);
  });

  it('consultant has hdis read-only and no admin sections', () => {
    const u = user('consultant');
    expect(can(u, 'hdis', 'view')).toBe(true);
    expect(can(u, 'hdis', 'edit')).toBe(false);
    expect(can(u, 'hdis', 'add')).toBe(false);
    expect(can(u, 'users', 'view')).toBe(false);
    expect(can(u, 'roles', 'view')).toBe(false);
    expect(can(u, 'hierarchy', 'view')).toBe(false);
    expect(can(u, 'interviews', 'edit')).toBe(true);
  });
});

describe('overrides', () => {
  it('grant a capability outside the role', () => {
    const u = user('consultant', { overrides: [{ section: 'hdis', capability: 'edit' }] });
    expect(can(u, 'hdis', 'edit')).toBe(true);
    expect(effectivePermissions(u).hdis).toContain('edit');
  });

  it('do not affect capabilities not granted', () => {
    const u = user('consultant', { overrides: [{ section: 'hdis', capability: 'edit' }] });
    expect(can(u, 'hdis', 'delete')).toBe(false);
  });
});

describe('HR-cannot-touch-super_admin', () => {
  const hr = user('hr_manager');
  const sa = user('super_admin');

  it('HR blocked from a super_admin target', () => {
    expect(() => assertCanManageUser(hr, { role: roles.super_admin })).toThrow(/Super Admin/);
  });
  it('HR may manage a consultant target', () => {
    expect(() => assertCanManageUser(hr, { role: roles.consultant })).not.toThrow();
  });
  it('Super Admin may manage a super_admin target', () => {
    expect(() => assertCanManageUser(sa, { role: roles.super_admin })).not.toThrow();
  });
  it('HR cannot edit protected/system roles', () => {
    expect(() => assertCanEditRole(hr, { isSystem: true, isProtected: true })).toThrow();
    expect(() => assertCanEditRole(hr, { isSystem: false, isProtected: false })).not.toThrow();
  });
  it('Super Admin may edit protected roles', () => {
    expect(() => assertCanEditRole(sa, { isSystem: true, isProtected: true })).not.toThrow();
  });
});

describe('scope resolution', () => {
  it('org scope sees everyone', () => {
    const u = user('super_admin', { id: 'u_kb', team: 'Leadership' });
    expect(scopeUserIds(u, directory).size).toBe(directory.length);
  });

  it('consultant (Pod A) scope = self + pod peers only (4)', () => {
    const u = user('consultant', { id: 'u_suhani', name: 'Suhani Singh', team: 'Pod A' });
    const names = scopeNames(u, directory);
    expect([...names].sort()).toEqual(
      ['Abha Sharma', 'Anshika Rana', 'Pragyashree Jain', 'Suhani Singh'].sort(),
    );
    expect(names.has('Akansha Singh')).toBe(false);
    expect(names.has('Kushagra Bindra')).toBe(false);
  });

  it('team scope includes the reporting subtree', () => {
    const u = user('consultant', { id: 'u_abha', name: 'Abha Sharma', team: 'Pod A' });
    const ids = scopeUserIds(u, directory);
    expect(ids.has('u_suhani')).toBe(true);
    expect(ids.has('u_pragyashree')).toBe(true);
    expect(ids.has('u_anshika')).toBe(true);
  });

  it('own scope sees only self', () => {
    const ownRole: RbacRole = { ...roles.consultant, scope: 'own' };
    const u: RbacUser = { ...user('consultant', { id: 'u_suhani' }), role: ownRole };
    expect(scopeUserIds(u, directory)).toEqual(new Set(['u_suhani']));
  });

  it('subtree walk is cycle-safe', () => {
    const cyclic: DirectoryNode[] = [
      { id: 'a', name: 'A', team: 'T', managerId: 'b' },
      { id: 'b', name: 'B', team: 'T', managerId: 'a' },
    ];
    expect(() => descendantIds('a', cyclic)).not.toThrow();
    expect(descendantIds('a', cyclic).has('b')).toBe(true);
  });
});
