import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe, consultantMe } from '../tests/utils';
import MyTeamPage from './MyTeamPage';

afterEach(() => vi.unstubAllGlobals());

const consultants = [
  {
    id: 'c_abha',
    userId: 'u_abha',
    name: 'Abha Sharma',
    email: 'a@vayuz.com',
    pod: 'Pod A',
    team: 'Pod A',
    eventsHosted: 4,
    eventsParticipated: 1,
    insights: 6,
  },
];

describe('My Team (T11.1)', () => {
  it('clicking a member routes to Home with the consultant selected', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/consultants', consultants)]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
        <Route path="/" element={<div>HOME consultant view</div>} />
      </Routes>,
      { route: '/team' },
    );
    const card = await screen.findByText('Abha Sharma');
    await userEvent.click(card);
    expect(await screen.findByText('HOME consultant view')).toBeInTheDocument();
  });

  it('reads as the full PPG roster (not "your pod") for org-scope users', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/consultants', consultants)]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
      </Routes>,
      { route: '/team' },
    );
    expect(await screen.findByRole('heading', { name: 'PPG Team' })).toBeInTheDocument();
    expect(screen.getByText(/All PPG consultants/)).toBeInTheDocument();
  });

  it('keeps "your pod" wording for team-scope users', async () => {
    mockFetch([jsonRoute('/api/me', consultantMe), jsonRoute('/api/consultants', consultants)]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
      </Routes>,
      { route: '/team' },
    );
    expect(await screen.findByRole('heading', { name: 'My Team' })).toBeInTheDocument();
    expect(screen.getByText(/Your pod/)).toBeInTheDocument();
  });
});
