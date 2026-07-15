import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../../tests/utils';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';
import HierarchyPage from './HierarchyPage';
import type { Me } from '../../lib/types';

afterEach(() => vi.unstubAllGlobals());

const users = [
  {
    id: 'u_kb',
    name: 'Kushagra Bindra',
    email: 'kushagra@vayuz.com',
    team: 'Leadership',
    isActive: true,
    managerId: null,
    managerName: null,
    role: { key: 'super_admin', label: 'Super Admin', scope: 'org' },
    overrides: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'u_suhani',
    name: 'Suhani Singh',
    email: 'suhani@vayuz.com',
    team: 'Pod A',
    isActive: true,
    managerId: 'u_abha',
    managerName: 'Abha Sharma',
    role: { key: 'consultant', label: 'Consultant', scope: 'team' },
    overrides: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const roles = [
  {
    id: 'r1',
    key: 'super_admin',
    label: 'Super Admin',
    sub: 'Co-Founder',
    scope: 'org',
    isSystem: true,
    isProtected: true,
    permissions: { hdis: ['view', 'add', 'edit', 'delete'] },
    userCount: 1,
  },
  {
    id: 'r2',
    key: 'consultant',
    label: 'Consultant',
    sub: 'PPG',
    scope: 'team',
    isSystem: true,
    isProtected: false,
    permissions: { hdis: ['view'] },
    userCount: 8,
  },
];

const hrMe: Me = {
  ...superAdminMe,
  id: 'u_aarti',
  name: 'Aarti Mehta',
  role: { key: 'hr_manager', label: 'HR Manager', sub: 'Admin', scope: 'org' },
};

describe('Users admin (T12.1)', () => {
  it('locks super_admin rows for an HR Manager', async () => {
    mockFetch([
      jsonRoute('/api/me', hrMe),
      jsonRoute('/api/users', users),
      jsonRoute('/api/roles', roles),
    ]);
    renderApp(<UsersPage />);
    const kbRow = await screen.findByTestId('user-row-u_kb');
    expect(kbRow.getAttribute('data-locked')).toBe('true');
    // No role <select> in the locked row.
    expect(within(kbRow).queryByRole('combobox')).toBeNull();

    const suhaniRow = screen.getByTestId('user-row-u_suhani');
    expect(suhaniRow.getAttribute('data-locked')).toBe('false');
    // Role select + manager select — both editable for an unlocked row.
    expect(within(suhaniRow).getAllByRole('combobox')).toHaveLength(2);
  });

  it("updates a user's manager via the manager select", async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/users', users),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users/u_suhani/manager', users[1], { method: 'PATCH' }),
    ]);
    renderApp(<UsersPage />);
    const suhaniRow = await screen.findByTestId('user-row-u_suhani');
    const [, managerSelect] = within(suhaniRow).getAllByRole('combobox');
    await userEvent.selectOptions(managerSelect, 'u_kb');

    const patched = calls.find(
      (c) => c.url.endsWith('/api/users/u_suhani/manager') && c.method === 'PATCH',
    );
    expect(patched).toBeTruthy();
    expect((patched!.body as { managerId: string }).managerId).toBe('u_kb');
  });

  it('marks org-scope users as already having all-client HDIS access', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/users', users),
      jsonRoute('/api/roles', roles),
    ]);
    renderApp(<UsersPage />);
    const kbRow = await screen.findByTestId('user-row-u_kb');
    expect(within(kbRow).getByText('All clients')).toBeInTheDocument();
  });

  it('grants full HDIS access to a non-org user via overrides', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/users', users),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users/u_suhani/overrides', users[1], { method: 'POST' }),
    ]);
    renderApp(<UsersPage />);
    const suhaniRow = await screen.findByTestId('user-row-u_suhani');
    await userEvent.click(within(suhaniRow).getByText('Grant full access'));

    const posted = calls.filter(
      (c) => c.url.endsWith('/api/users/u_suhani/overrides') && c.method === 'POST',
    );
    expect(posted).toHaveLength(2);
    const capabilities = posted.map((c) => (c.body as { capability: string }).capability).sort();
    expect(capabilities).toEqual(['edit', 'view_all']);
    expect(posted.every((c) => (c.body as { section: string }).section === 'hdis')).toBe(true);
    expect(posted.every((c) => (c.body as { grant: boolean }).grant === true)).toBe(true);
  });
});

describe('Roles admin (T12.2)', () => {
  it('renders role cards with the permission matrix', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users', users),
    ]);
    renderApp(<RolesPage />);
    // 'Consultant' also appears as an option in the Create user role picker now;
    // 'Super Admin' appears in the sidebar too.
    expect((await screen.findAllByText('Consultant')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('system').length).toBeGreaterThan(0);
  });

  it('lets the creator pick a role and a line manager for the new user', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users', users),
    ]);
    renderApp(<RolesPage />);

    // Wait for the role cards and the manager options (roles + users fetches) to land.
    await screen.findAllByText('system');
    await screen.findByText((content) => content.includes('Kushagra Bindra'), {
      selector: 'option',
    });

    const comboboxes = screen.getAllByRole('combobox');
    const optionValues = (el: HTMLElement) =>
      within(el)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value);
    const optionTexts = (el: HTMLElement) =>
      within(el)
        .getAllByRole('option')
        .map((o) => o.textContent);

    const roleSelect = comboboxes.find(
      (el) => optionValues(el).includes('super_admin') && optionValues(el).includes('consultant'),
    );
    expect(roleSelect).toBeDefined();

    const managerSelect = comboboxes.find((el) => optionTexts(el).includes('No manager'));
    expect(managerSelect).toBeDefined();
    expect(optionTexts(managerSelect!)).toEqual(
      expect.arrayContaining([
        'No manager',
        expect.stringContaining('Kushagra Bindra'),
        expect.stringContaining('Suhani Singh'),
      ]),
    );
  });

  it('includes hdisFullAccess in the create-user payload when checked', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users', users),
      jsonRoute('/api/users', users[1], { method: 'POST' }),
    ]);
    renderApp(<RolesPage />);
    await screen.findAllByText('system');

    await userEvent.type(screen.getByPlaceholderText('Full name'), 'New Person');
    await userEvent.type(screen.getByPlaceholderText('name@vayuz.com'), 'new@vayuz.com');
    await userEvent.click(
      screen.getByText('Full HDIS access (all clients, not just the ones they own)'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create user' }));

    const posted = calls.find((c) => c.url.endsWith('/api/users') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { hdisFullAccess: boolean }).hdisFullAccess).toBe(true);
  });

  it('includes emailCredentials in the payload and reports the send result', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users', users),
      jsonRoute('/api/users', { ...users[1], emailSent: true }, { method: 'POST' }),
    ]);
    renderApp(<RolesPage />);
    await screen.findAllByText('system');

    await userEvent.type(screen.getByPlaceholderText('Full name'), 'New Person');
    await userEvent.type(screen.getByPlaceholderText('name@vayuz.com'), 'new@vayuz.com');
    await userEvent.click(screen.getByText('Email login credentials to this user'));
    await userEvent.click(screen.getByRole('button', { name: 'Create user' }));

    const posted = calls.find((c) => c.url.endsWith('/api/users') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { emailCredentials: boolean }).emailCredentials).toBe(true);

    expect(await screen.findByText(/Credentials emailed to new@vayuz.com/)).toBeInTheDocument();
  });

  it('flags when a requested credentials email could not be sent', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/roles', roles),
      jsonRoute('/api/users', users),
      jsonRoute('/api/users', { ...users[1], emailSent: false }, { method: 'POST' }),
    ]);
    renderApp(<RolesPage />);
    await screen.findAllByText('system');

    await userEvent.type(screen.getByPlaceholderText('Full name'), 'New Person');
    await userEvent.type(screen.getByPlaceholderText('name@vayuz.com'), 'new@vayuz.com');
    await userEvent.click(screen.getByText('Email login credentials to this user'));
    await userEvent.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText(/Couldn't email the credentials/)).toBeInTheDocument();
  });
});

describe('Hierarchy admin (T12.3)', () => {
  it('renders the seed org tree', async () => {
    const tree = [
      {
        id: 'u_kb',
        name: 'Kushagra Bindra',
        email: 'k@vayuz.com',
        team: 'Leadership',
        role: 'super_admin',
        reports: [
          {
            id: 'u_aarti',
            name: 'Aarti Mehta',
            email: 'a@vayuz.com',
            team: 'Leadership',
            role: 'hr_manager',
            reports: [],
          },
        ],
      },
    ];
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/hierarchy', tree)]);
    renderApp(<HierarchyPage />);
    // 'Aarti Mehta' is unique to the tree; the logged-in name also appears in the sidebar.
    expect(await screen.findByText('Aarti Mehta')).toBeInTheDocument();
    expect(screen.getAllByText('Kushagra Bindra').length).toBeGreaterThanOrEqual(1);
  });
});
