import { screen, within } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, consultantMe, superAdminMe } from '../tests/utils';
import ProfilePage from './ProfilePage';

afterEach(() => vi.unstubAllGlobals());

describe('App shell + RBAC nav (T7.3)', () => {
  it('a consultant sees no Admin nav items', async () => {
    mockFetch([jsonRoute('/api/me', consultantMe)]);
    renderApp(<ProfilePage />);
    const sidebar = await screen.findByTestId('sidebar');
    expect(within(sidebar).getByText('Home')).toBeInTheDocument();
    expect(within(sidebar).getByText('HDIS')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Users')).not.toBeInTheDocument();
    expect(within(sidebar).queryByText('Roles & Access')).not.toBeInTheDocument();
    expect(within(sidebar).queryByText('Team Hierarchy')).not.toBeInTheDocument();
  });

  it('a super_admin sees Admin nav items', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe)]);
    renderApp(<ProfilePage />);
    const sidebar = await screen.findByTestId('sidebar');
    expect(within(sidebar).getByText('Users')).toBeInTheDocument();
    expect(within(sidebar).getByText('Team Hierarchy')).toBeInTheDocument();
  });
});

describe('Profile access grid (T11.2)', () => {
  it('renders the access grid from /me', async () => {
    mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute('/api/consultant-log/day', []),
      jsonRoute('/api/consultant-log', { month: '2026-07', counts: {}, total: 0 }),
    ]);
    renderApp(<ProfilePage />);
    await screen.findByText('abha@vayuz.com');
    // consultant profile shows personal stats
    expect(
      within(screen.getByText('Your stats').closest('.card')!).getByText('Insights'),
    ).toBeInTheDocument();
    // my-activity calendar section is present
    expect(screen.getByText(/My activity/)).toBeInTheDocument();
    // access grid has section rows
    expect(screen.getByText('hierarchy')).toBeInTheDocument();
  });
});
