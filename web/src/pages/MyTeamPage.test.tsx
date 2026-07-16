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

const roster = [
  {
    id: 'c_abha',
    name: 'Abha Sharma',
    role: 'PPG Consultant',
    activeReqs: 7,
    load: 'OK',
    onboardMtd: 1,
    onboardTarget: 2,
    profilesWk: 35,
    profilesTarget: 60,
    hdisToday: true,
    kpiVal: 3.1,
    kpiBand: 'ME',
  },
];

describe('My Team (T11.1)', () => {
  it('clicking a member on a pod-scoped roster routes to their dedicated report page', async () => {
    mockFetch([jsonRoute('/api/me', consultantMe), jsonRoute('/api/consultants', consultants)]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
        <Route path="/team/:consultantId" element={<div>CONSULTANT DETAIL PAGE</div>} />
      </Routes>,
      { route: '/team' },
    );
    // Both the signed-in user's own name (sidebar) and their team card show "Abha
    // Sharma" — target the clickable pcard via its "Pod A" pod line to disambiguate.
    const pod = await screen.findByText('Pod A');
    await userEvent.click(pod.closest('.pcard')!);
    expect(await screen.findByText('CONSULTANT DETAIL PAGE')).toBeInTheDocument();
  });

  it('reads as the full PPG roster (not "your pod") for org-scope users', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/report/roster', roster),
    ]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
      </Routes>,
      { route: '/team' },
    );
    expect(await screen.findByRole('heading', { name: 'PPG Team' })).toBeInTheDocument();
    expect(screen.getByText(/All PPG people, HR Managers to Consultants/)).toBeInTheDocument();
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

describe('PPG Team Roster table (org scope)', () => {
  it('renders the roster table with performance columns and opens the detail page on click', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/report/roster', roster),
    ]);
    renderApp(
      <Routes>
        <Route path="/team" element={<MyTeamPage />} />
        <Route path="/team/:consultantId" element={<div>CONSULTANT DETAIL PAGE</div>} />
      </Routes>,
      { route: '/team' },
    );
    expect(await screen.findByText('PPG Team Roster')).toBeInTheDocument();
    expect(screen.getByText('Active Reqs')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('35/60')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('ME')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Abha Sharma'));
    expect(await screen.findByText('CONSULTANT DETAIL PAGE')).toBeInTheDocument();
  });
});
