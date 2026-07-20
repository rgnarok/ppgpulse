import { describe, it, expect } from 'vitest';
import { visibleNav } from './permissions';
import type { Me } from './types';

function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: 'u1',
    name: 'Test User',
    email: 't@vayuz.com',
    team: 'Pod A',
    managerId: null,
    isActive: true,
    role: { key: 'consultant', label: 'Consultant', sub: 'PPG', scope: 'team' },
    scope: 'team',
    hasReports: false,
    permissions: { home: ['view'], hdis: ['view'], myteam: ['view'] },
    consultant: null,
    ...overrides,
  };
}

describe('visibleNav', () => {
  it('hides the Clients admin item unless the user can edit HDIS records', () => {
    const consultant = makeMe({ permissions: { home: ['view'], hdis: ['view'] } });
    expect(visibleNav(consultant).some((n) => n.key === 'clients')).toBe(false);

    // Can add HDIS records (their own JDs) but not edit — still no standalone
    // client-master admin screen; they add new clients inline via the HDIS form.
    const consultantWithAdd = makeMe({ permissions: { home: ['view'], hdis: ['view', 'add'] } });
    expect(visibleNav(consultantWithAdd).some((n) => n.key === 'clients')).toBe(false);

    const admin = makeMe({
      role: { key: 'super_admin', label: 'Super Admin', sub: 'Co-Founder', scope: 'org' },
      scope: 'org',
      permissions: { home: ['view'], hdis: ['view', 'add', 'edit', 'delete'] },
    });
    expect(visibleNav(admin).some((n) => n.key === 'clients')).toBe(true);
  });

  it('shows My Team for org scope regardless of hasReports', () => {
    const admin = makeMe({
      role: { key: 'super_admin', label: 'Super Admin', sub: 'Co-Founder', scope: 'org' },
      scope: 'org',
      hasReports: false,
      permissions: { home: ['view'], myteam: ['view'] },
    });
    expect(visibleNav(admin).some((n) => n.key === 'myteam')).toBe(true);
  });

  it('hides My Team for a team-scope user with no direct reports', () => {
    const ic = makeMe({ scope: 'team', hasReports: false });
    expect(visibleNav(ic).some((n) => n.key === 'myteam')).toBe(false);
  });

  it('shows My Team for a team-scope user who has direct reports', () => {
    const lead = makeMe({ scope: 'team', hasReports: true });
    expect(visibleNav(lead).some((n) => n.key === 'myteam')).toBe(true);
  });

  it('shows Dhruva only for a user with dhruva:view (super_admin by default)', () => {
    const consultant = makeMe();
    expect(visibleNav(consultant).some((n) => n.key === 'dhruva')).toBe(false);

    const hrManager = makeMe({
      role: { key: 'hr_manager', label: 'HR Manager', sub: 'Admin', scope: 'org' },
      scope: 'org',
      permissions: { home: ['view'], hdis: ['view', 'add', 'edit', 'delete'] },
    });
    expect(visibleNav(hrManager).some((n) => n.key === 'dhruva')).toBe(false);

    const admin = makeMe({
      role: { key: 'super_admin', label: 'Super Admin', sub: 'Co-Founder', scope: 'org' },
      scope: 'org',
      permissions: { home: ['view'], dhruva: ['view'] },
    });
    expect(visibleNav(admin).some((n) => n.key === 'dhruva')).toBe(true);
  });
});
