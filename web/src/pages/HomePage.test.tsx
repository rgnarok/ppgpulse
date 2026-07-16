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

const scopedOverview = {
  period: { lo: '2025-12-01', hi: '2026-06-30' },
  tiles: {
    requirementsReceived: 18,
    totalClosures: 2,
    closureSplit: { radc: 1, radf: 1 },
    totalRequirements: 18,
    insightsPublished: 6,
    eventsHosted: 4,
    eventsParticipated: 1,
    consultants: 1,
  },
  charts: {
    requirementsByConsultant: [{ name: 'Abha Sharma', value: 18 }],
    statusMix: { active: 10, onHold: 6, closed: 2 },
    closuresByConsultant: [{ name: 'Abha Sharma', value: 2 }],
    confidenceByConsultant: [{ name: 'Abha Sharma', value: 63 }],
  },
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
    expect(screen.getByText('PPG')).toBeInTheDocument();
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

describe('Home consultant filter (T8.3)', () => {
  const consultantsList = [
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

  it('scopes the same Overview tiles/charts to one person instead of showing a different page', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/consultants', consultantsList),
      jsonRoute('/api/report/overview', scopedOverview),
      jsonRoute('/api/interviews', { month: '2026-06', counts: {}, total: 0 }),
    ]);
    renderApp(<HomePage />, { route: '/?consultant=c_abha' });

    // Same tile labels as the team-wide view — no separate report/layout.
    expect(await screen.findByText('Requirements Received')).toBeInTheDocument();
    expect(screen.getByText('Total Closures')).toBeInTheDocument();
    expect(screen.getByText(/Showing Abha Sharma.?s data only/)).toBeInTheDocument();

    const overviewCall = calls.find((c) => c.url.includes('/api/report/overview'));
    expect(overviewCall?.url).toContain('consultantId=c_abha');
  });
});
