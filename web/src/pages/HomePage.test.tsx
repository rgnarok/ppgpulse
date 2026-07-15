import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../tests/utils';
import HomePage from './HomePage';

// Chart.js needs a canvas 2d context that jsdom lacks — stub the chart components.
vi.mock('../components/charts', () => ({
  HBarChart: () => <div data-testid="hbar" />,
  DonutChart: () => <div data-testid="donut" />,
}));

afterEach(() => vi.unstubAllGlobals());

const overview = {
  period: { lo: '2025-12-01', hi: '2026-06-30' },
  tiles: {
    requirementsReceived: 145,
    totalClosures: 14,
    closureSplit: { radc: 6, radf: 3 },
    totalRequirements: 145,
    insightsPublished: 36,
    eventsHosted: 11,
    eventsParticipated: 3,
    consultants: 10,
  },
  charts: {
    requirementsByConsultant: [{ name: 'Abha Sharma', value: 18 }],
    statusMix: { active: 40, onHold: 90, closed: 15 },
    closuresByConsultant: [{ name: 'Abha Sharma', value: 0 }],
    confidenceByConsultant: [{ name: 'Abha Sharma', value: 63 }],
  },
};

const emptyReport = {
  period: { lo: '2025-12-01', hi: '2026-06-30' },
  consultant: {
    id: 'c_abha',
    name: 'Abha Sharma',
    email: 'a@vayuz.com',
    pod: 'Pod A',
    eventsHosted: 0,
    eventsParticipated: 0,
    insights: 0,
  },
  stats: { reqs: 0, closed: 0, profiles: 0, shortlist: 0, onboard: 0, l1: 0, l2: 0, l3: 0 },
  confidence: { score: 0, band: 'No data', factors: [] },
  kpi: { val: 0, label: 'At risk' },
  funnel: [
    { code: 'R0', label: 'Profiles', actual: 0, target: 8 },
    { code: 'R1', label: 'Shortlist', actual: 0, target: 3 },
    { code: 'R2', label: 'L1', actual: 0, target: 2 },
    { code: 'R3', label: 'L2', actual: 0, target: 1 },
    { code: 'R4', label: 'L3', actual: 0, target: 1 },
    { code: 'R5', label: 'Onboard', actual: 0, target: 1 },
  ],
  requirements: [],
};

describe('Home overview (T8.2)', () => {
  it('renders the 7 tiles from the mocked API', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', []),
      jsonRoute('/api/report/overview', overview),
      jsonRoute('/api/interviews', { month: '2026-06', counts: {}, total: 0 }),
    ]);
    renderApp(<HomePage />);
    expect(await screen.findByText('Requirements Received')).toBeInTheDocument();
    // 145 appears in both "Requirements Received" and "Total Requirements" tiles.
    expect(screen.getAllByText('145').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('6 RADC · 3 RADF')).toBeInTheDocument();
    expect(screen.getByText('Consultants')).toBeInTheDocument();
  });

  it('shows an "Interviews this month" count that links into the Interviews page', async () => {
    const user = userEvent.setup();
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', []),
      jsonRoute('/api/report/overview', overview),
      jsonRoute('/api/interviews', { month: '2026-06', counts: {}, total: 7 }),
    ]);
    renderApp(<HomePage />);
    expect(await screen.findByText('Interviews this month')).toBeInTheDocument();
    expect(await screen.findByText('7')).toBeInTheDocument();
    // Clicking it should not throw — it navigates into the Interviews page's month view.
    await user.click(screen.getByRole('button', { name: /Interviews this month/ }));
  });
});

describe('Home consultant drilldown + empty state (T8.3)', () => {
  it('shows the empty-period state when a consultant has no requirements', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', [
        {
          id: 'c_abha',
          userId: 'u_abha',
          name: 'Abha Sharma',
          email: 'a@vayuz.com',
          pod: 'Pod A',
          team: 'Pod A',
          eventsHosted: 0,
          eventsParticipated: 0,
          insights: 0,
        },
      ]),
      jsonRoute('/api/report/consultant/c_abha', emptyReport),
    ]);
    renderApp(<HomePage />, { route: '/?consultant=c_abha' });
    expect(await screen.findByText('No requirements in this period')).toBeInTheDocument();
  });
});
