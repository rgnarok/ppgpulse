import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../../tests/utils';
import AuditLogPage from './AuditLogPage';

const entries = [
  {
    id: 'a1',
    actorId: 'u_kb',
    actorName: 'Kushagra Bindra',
    section: 'users',
    action: 'create',
    detail: 'Created user Suhani Singh (suhani@vayuz.com), role Consultant',
    entityId: 'u_suhani',
    at: '2026-07-15T09:41:00.000Z',
  },
  {
    id: 'a2',
    actorId: 'u_aarti',
    actorName: 'Aarti Mehta',
    section: 'hdis',
    action: 'create_client',
    detail: 'Added client "Randstad"',
    entityId: 'c1',
    at: '2026-07-14T12:00:00.000Z',
  },
];

describe('Activity Log', () => {
  it('renders recent activity with actor, section, and detail', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/audit-log', entries)]);
    renderApp(<AuditLogPage />);
    // "Kushagra Bindra" also appears in the sidebar as the logged-in user.
    expect((await screen.findAllByText('Kushagra Bindra')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Aarti Mehta')).toBeInTheDocument();
    expect(screen.getByText(/Created user Suhani Singh/)).toBeInTheDocument();
    expect(screen.getByText(/Added client "Randstad"/)).toBeInTheDocument();
  });

  it('shows the empty state when there is no activity', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/audit-log', [])]);
    renderApp(<AuditLogPage />);
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });

  it('re-queries with a section filter', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/audit-log', entries),
    ]);
    renderApp(<AuditLogPage />);
    await screen.findAllByText('Kushagra Bindra');

    await userEvent.selectOptions(screen.getByLabelText('Section'), 'hdis');

    const filtered = calls.filter((c) => c.url.includes('/api/audit-log'));
    expect(filtered.some((c) => c.url.includes('section=hdis'))).toBe(true);
  });
});
