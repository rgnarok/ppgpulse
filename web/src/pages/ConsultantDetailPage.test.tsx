import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../tests/utils';
import ConsultantDetailPage from './ConsultantDetailPage';
import type { ConsultantReport } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

const report: ConsultantReport = {
  period: { lo: '2025-12-01', hi: '2026-06-30' },
  consultant: {
    id: 'c_suhani',
    name: 'Suhani Singh',
    email: 's@vayuz.com',
    pod: 'Pod B',
    role: 'Sr. PPG Consultant',
    eventsHosted: 0,
    eventsParticipated: 0,
    insights: 1,
  },
  stats: { reqs: 27, closed: 0, profiles: 221, shortlist: 91, onboard: 0, l1: 28, l2: 9, l3: 0 },
  confidence: {
    score: 38,
    band: 'Low confidence',
    factors: [
      ['Pipeline progression', 13],
      ['Shortlist quality', 100],
      ['TAT adherence', 63],
      ['Conversion to join', 0],
    ],
  },
  kpi: { val: 2, label: 'NI' },
  funnel: [
    { code: 'R0', label: 'Profiles', actual: 221, target: 216 },
    { code: 'R1', label: 'Shortlist', actual: 91, target: 81 },
    { code: 'R2', label: 'L1', actual: 28, target: 54 },
    { code: 'R3', label: 'L2', actual: 9, target: 27 },
    { code: 'R4', label: 'L3', actual: 0, target: 27 },
    { code: 'R5', label: 'Onboard', actual: 0, target: 27 },
  ],
  closureSplit: { radc: 0, radf: 0 },
  requirements: [
    {
      id: 'r1',
      code: 'C1',
      jdId: 'NAV_SMSDFC_20261506',
      title: 'Sr. MS Dynamics Functional Consultant',
      client: 'NavsoftAI',
      reqDate: '2026-06-29',
      status: 'Active',
      statusReason: null,
      profiles: 1,
      shortlist: 2,
      l1: 2,
      l2: 0,
      l3: 0,
      onboard: 0,
      type: 'RADF',
      jdLink: 'https://jd.example.com/nav',
    },
  ],
};

describe('Consultant detail page', () => {
  it('renders the confidence banner, KPI tiles, and requirements table for the routed consultant', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/report/consultant/c_suhani', report),
    ]);
    renderApp(
      <Routes>
        <Route path="/team/:consultantId" element={<ConsultantDetailPage />} />
      </Routes>,
      { route: '/team/c_suhani' },
    );

    expect(await screen.findByText('Overall Confidence — Suhani Singh')).toBeInTheDocument();
    // The role/pod appears both in the page subtitle and the confidence banner.
    expect(screen.getAllByText(/Sr\. PPG Consultant/).length).toBeGreaterThan(0);
    const reqsTile = screen.getByText('Total Requirements Received').closest('.kc') as HTMLElement;
    expect(within(reqsTile).getByText('27')).toBeInTheDocument();
    expect(screen.getByText('NAV_SMSDFC_20261506')).toBeInTheDocument();
    expect(screen.getByText('Sr. MS Dynamics Functional Consultant')).toBeInTheDocument();
    expect(screen.getByText('RADF')).toBeInTheDocument();
    expect(screen.getByText('JD ↗')).toBeInTheDocument();
  });

  it('"Back to team" link routes back to /team, not the home dashboard', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/report/consultant/c_suhani', report),
    ]);
    renderApp(
      <Routes>
        <Route path="/team/:consultantId" element={<ConsultantDetailPage />} />
        <Route path="/team" element={<div>TEAM PAGE</div>} />
        <Route path="/" element={<div>HOME PAGE</div>} />
      </Routes>,
      { route: '/team/c_suhani' },
    );
    await screen.findByText('Overall Confidence — Suhani Singh');
    await userEvent.click(screen.getByText('← Back to team'));
    expect(await screen.findByText('TEAM PAGE')).toBeInTheDocument();
  });
});
