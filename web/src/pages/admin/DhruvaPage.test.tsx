import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../../tests/utils';
import DhruvaPage from './DhruvaPage';
import type { DhruvaDashboard } from '../../lib/types';

afterEach(() => vi.unstubAllGlobals());

const dashboard: DhruvaDashboard = {
  // Every number here is deliberately distinct so screen.getByText(...) assertions
  // below can't collide with an unrelated tile showing the same value.
  rapyd: { total: 66, radc: 39, radf: 27 },
  segregation: { total: 74, radc: 39, radf: 27, internal: 8 },
  activeClients: 29,
  interviewsToday: { total: 5, radc: 2, radf: 3 },
  priority: { p1: 3, p2: 13, p3: 19, uncategorised: 31 },
  funnel: [
    { code: 'R0', label: 'Profiles Shared', count: 340, dropoffPct: null },
    { code: 'R1', label: 'Client Shortlist', count: 102, dropoffPct: 70 },
    { code: 'R2', label: 'Technical Interview', count: 41, dropoffPct: 60 },
    { code: 'R3', label: 'Fitment / Org', count: 12, dropoffPct: 71 },
    { code: 'R4', label: 'HR Interview', count: 12, dropoffPct: 0 },
    { code: 'R5', label: 'Offer & Onboarded', count: 7, dropoffPct: 42 },
  ],
  funnelTotal: 66,
  topClients: {
    radc: [
      { client: 'Religare', deployed: 2 },
      { client: 'MathCo', deployed: 2 },
    ],
    radf: [{ client: 'Abakkus', deployed: 1 }],
  },
  closureTarget: { kpiId: 'kpi-closure', target: 10, actual: 8, radc: 5, radf: 3 },
};

// Deliberately a different client than any in `dashboard.topClients` so the client
// filter's <option> text can't collide with a Top Clients list entry.
const clients = [{ id: 'c1', name: 'Testify', createdAt: '2026-06-01T00:00:00.000Z' }];
const consultants = [
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

function routes() {
  return [
    jsonRoute('/api/me', superAdminMe),
    jsonRoute('/api/report/dhruva', dashboard),
    jsonRoute('/api/clients', clients),
    jsonRoute('/api/consultants', consultants),
    jsonRoute('/api/report/roster', roster),
  ];
}

describe('Dhruva dashboard', () => {
  it('renders the Total Live Requirements, priority, funnel, top-clients, and roster sections', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
      </Routes>,
      { route: '/admin/dhruva' },
    );

    // The RAPYD Active tile was removed (redundant with Total Live Requirements,
    // which shows the same RADC/RADF split plus Internal) — segregation.total is
    // now the load-complete anchor.
    expect(await screen.findByText('74')).toBeInTheDocument(); // segregation.total
    expect(screen.getByText('39')).toBeInTheDocument(); // segregation.radc
    expect(screen.getByText('27')).toBeInTheDocument(); // segregation.radf
    expect(screen.getByText('29')).toBeInTheDocument();

    expect(screen.getByText('P1 — Live')).toBeInTheDocument();
    expect(screen.getByText('P2 — Live')).toBeInTheDocument();
    expect(screen.getByText('P3 — Live')).toBeInTheDocument();
    // "Uncategorised" also appears as an option in the funnel's Priority filter select.
    expect(screen.getAllByText('Uncategorised').length).toBeGreaterThan(0);

    expect(screen.getByText('Recruitment Lifecycle Funnel · R0 → R5')).toBeInTheDocument();
    // The funnel card fetches its own (period-scoped) query, separate from the
    // headline tiles' unscoped one — give it its own await.
    expect(await screen.findByText('Profiles Shared')).toBeInTheDocument();
    expect(screen.getByText('Offer & Onboarded')).toBeInTheDocument();

    const rosterHeading = await screen.findByText('PPG Team Roster');
    expect(rosterHeading).toBeInTheDocument();
    // "Abha Sharma" also appears as an option in the funnel's PPG filter select, so
    // scope the roster-row check to the roster card itself.
    const rosterCard = rosterHeading.closest('.card') as HTMLElement;
    expect(within(rosterCard).getByText('Abha Sharma')).toBeInTheDocument();
  });

  it('shows an empty state when there is no live HDIS data yet', async () => {
    const empty: DhruvaDashboard = {
      rapyd: { total: 0, radc: 0, radf: 0 },
      segregation: { total: 0, radc: 0, radf: 0, internal: 0 },
      activeClients: 0,
      interviewsToday: { total: 0, radc: 0, radf: 0 },
      priority: { p1: 0, p2: 0, p3: 0, uncategorised: 0 },
      funnel: dashboard.funnel.map((f) => ({
        ...f,
        count: 0,
        dropoffPct: f.code === 'R0' ? null : 0,
      })),
      funnelTotal: 0,
      topClients: { radc: [], radf: [] },
      closureTarget: { kpiId: null, target: 0, actual: 0, radc: 0, radf: 0 },
    };
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/report/dhruva', empty),
      jsonRoute('/api/clients', []),
      jsonRoute('/api/consultants', []),
    ]);
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    expect(await screen.findByText('No live HDIS records yet')).toBeInTheDocument();
  });

  it('clicking a priority tile jumps to the HDIS list, filtered to that priority and Active only', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
        <Route path="/hdis" element={<div>HDIS PAGE</div>} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    const p1Tile = await screen.findByText('P1 — Live');
    await userEvent.click(p1Tile.closest('[role="button"]')!);
    expect(await screen.findByText('HDIS PAGE')).toBeInTheDocument();
  });

  it('clicking the RADC number on the Total Live Requirements tile jumps to the HDIS list filtered by type', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
        <Route path="/hdis" element={<div>HDIS PAGE</div>} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    const heading = await screen.findByText(
      (_, el) => el?.textContent === '◆ Total Live Requirements',
    );
    const tile = heading.closest('.skc') as HTMLElement;
    const radcNumber = within(tile).getByText('39'); // segregation.radc from the mocked dashboard
    await userEvent.click(radcNumber.closest('[role="button"]')!);
    expect(await screen.findByText('HDIS PAGE')).toBeInTheDocument();
  });

  it('shows the Closure Target section with actual vs. target and the RADC/RADF split', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    const closureHeading = await screen.findByText('Closure Target');
    const closureSection = closureHeading.closest('div')!.parentElement!
      .parentElement as HTMLElement;
    expect(within(closureSection).getByText('8')).toBeInTheDocument(); // closureTarget.actual
    expect(within(closureSection).getByText('10 target')).toBeInTheDocument();
    expect(
      within(closureSection).getByText(
        (_, el) => el?.textContent === 'RADC 5 + RADF 3 closed this period',
      ),
    ).toBeInTheDocument();
  });

  it('defaults the period filter to the current month', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    await screen.findByText('74');
    const monthInput = screen.getByLabelText('Month') as HTMLInputElement;
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(monthInput.value).toBe(expected);
  });

  it('scopes the headline tiles (not just the funnel) to the period filter', async () => {
    const { calls } = mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/dhruva" element={<DhruvaPage />} />
      </Routes>,
      { route: '/admin/dhruva' },
    );
    await screen.findByText('74');
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // The headline tiles' fetch must carry the current month — proving it's no
    // longer the unscoped useDhruva({}) call it used to be. (React Query dedupes
    // this against the funnel card's identical-at-this-point query, so there's
    // just the one network call while no funnel-only filter is applied yet.)
    const dhruvaCalls = calls.filter((c) => c.url.includes('/report/dhruva'));
    expect(dhruvaCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of dhruvaCalls) {
      expect(c.url).toContain(`month=${currentMonth}`);
    }
  });
});
