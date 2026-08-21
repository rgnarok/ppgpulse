import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe, consultantMe } from '../tests/utils';
import HdisPage from './HdisPage';
import type { HdisRecord, Me, RequirementDetail } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

// consultantMe (name "Abha Sharma") is deliberately the *owner* of `record` below, so
// it doubles as the "owner without blanket edit" fixture. A genuine outsider — same
// team-scope role, but not listed as an owner of anything — needs a separate identity.
const outsiderMe: Me = { ...consultantMe, id: 'u_outsider', name: 'Someone Else' };

// A genuinely view-only role (no hdis:add) — distinct from consultantMe, which now
// carries hdis:add so consultants can log their own JDs.
const viewOnlyMe: Me = {
  ...consultantMe,
  id: 'u_viewonly',
  name: 'View Only',
  permissions: { ...consultantMe.permissions, hdis: ['view'] },
};

const record: HdisRecord = {
  jdId: 'TST_QA_20260601',
  title: 'QA Engineer',
  client: 'Testify',
  type: 'RADC',
  techStack: null,
  openings: 1,
  status: 'Active',
  statusReason: null,
  remarks: null,
  priority: 'NA',
  confidence: 'Medium',
  reqDate: '2026-06-01',
  jdLink: null,
  owners: ['Abha Sharma'],
  pipeline: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, stage: 'R0 · Sourcing' },
  attachments: [],
  aging: {
    totalDays: 0,
    transitions: { 'R0->R1': null, 'R1->R2': null, 'R2->R3': null, 'R3->R4': null, 'R4->R5': null },
  },
  // Fixture represents an already-Active record, so its questionnaire is complete —
  // matches what would actually be true for any record that reached Active.
  detailsComplete: true,
  requirementDetail: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const record2: HdisRecord = {
  ...record,
  jdId: 'TST_BA_20260602',
  title: 'Business Analyst',
  client: 'Acme Corp',
  reqDate: '2026-06-02',
  owners: ['Priya Pal'],
};

const record3: HdisRecord = {
  ...record,
  jdId: 'TST_UX_20260215',
  title: 'UX Designer',
  client: 'Testify',
  reqDate: '2026-02-15', // Jan–Mar -> falls in FY 2025-26, not FY 2026-27.
  owners: ['Abha Sharma'],
};

const clients = [
  { id: 'c1', name: 'Testify', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'c2', name: 'Acme Corp', createdAt: '2026-06-01T00:00:00.000Z' },
];

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
  {
    id: 'c_priya',
    userId: 'u_priya',
    name: 'Priya Pal',
    email: 'p@vayuz.com',
    pod: 'Pod B',
    team: 'Pod B',
    eventsHosted: 0,
    eventsParticipated: 0,
    insights: 0,
  },
];

function routesFor(role: typeof superAdminMe, rows: HdisRecord[] = [record]) {
  return [
    jsonRoute('/api/me', role),
    jsonRoute('/api/hdis/TST_QA_20260601/activity', []),
    jsonRoute('/api/hdis/TST_QA_20260601/candidates', []),
    jsonRoute('/api/hdis/TST_QA_20260601', record),
    jsonRoute('/api/hdis', rows),
    jsonRoute('/api/clients', clients),
    jsonRoute('/api/consultants', consultants),
  ];
}

describe('HDIS list (T10.1)', () => {
  it('renders records and shows Add for an admin', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    expect(await screen.findByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('+ Add record')).toBeInTheDocument();
  });

  it('defaults the FY and month filters to the current fiscal year and month on a fresh visit', async () => {
    // record2's reqDate (2026-06) is very unlikely to be "this month" whenever the test
    // suite happens to run, so a fresh /hdis visit (no URL params at all) should default
    // to the current month/FY and hide it -- matching Dhruva's "defaults to now"
    // convention -- while a deliberately-cleared URL (Reset) still shows everything.
    // Closed rather than Active/on-inherited-default status, since an open record from
    // an earlier month is now expected to carry forward into the current month view —
    // this test is specifically about a record that's done, not a still-open one.
    const now = new Date();
    const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const expectedFy = String(now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1);

    mockFetch(routesFor(superAdminMe, [{ ...record2, status: 'Closed' }]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
    );
    expect(await screen.findByText('No HDIS records match these filters')).toBeInTheDocument();
    expect(screen.getByLabelText('Fiscal year')).toHaveValue(expectedFy);
    expect(screen.getByLabelText('Month')).toHaveValue(expectedMonth);

    await userEvent.click(screen.getByText('Reset'));
    expect(await screen.findByText('Business Analyst')).toBeInTheDocument();
    expect(screen.getByLabelText('Fiscal year')).toHaveValue('');
    expect(screen.getByLabelText('Month')).toHaveValue('');
  });

  it('shows Total Requirements split by RADC/RADF/Internal, unaffected by the active filters', async () => {
    const radf: HdisRecord = {
      ...record,
      jdId: 'TST_RF_20260603',
      title: 'DevOps Engineer',
      type: 'RADF',
      client: 'Acme Corp',
    };
    const internal: HdisRecord = {
      ...record,
      jdId: 'TST_INT_20260604',
      title: 'Internal Recruiter',
      type: 'Internal',
      client: 'Acme Corp',
    };
    mockFetch(routesFor(superAdminMe, [record, record2, radf, internal]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    const totalCard = screen.getByText(/Total Requirements/).closest('.skc') as HTMLElement;
    expect(within(totalCard).getByText('4')).toBeInTheDocument();
    expect(within(totalCard).getByText('2')).toBeInTheDocument(); // RADC
    expect(within(totalCard).getAllByText('1').length).toBe(2); // RADF and Internal both 1
    expect(within(totalCard).getByText('Internal')).toBeInTheDocument();

    // Narrowing the list filter doesn't change the headline card — it always
    // reflects the full dataset.
    await userEvent.selectOptions(screen.getByLabelText('Client'), 'Acme Corp');
    expect(within(totalCard).getByText('4')).toBeInTheDocument();
  });

  it('hides Add for a genuinely view-only user', async () => {
    mockFetch(routesFor(viewOnlyMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.queryByText('+ Add record')).not.toBeInTheDocument();
  });

  it('lets a consultant add a record for their own JD, pre-owned by themselves', async () => {
    mockFetch(routesFor(consultantMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('+ Add record')).toBeInTheDocument();
    await userEvent.click(screen.getByText('+ Add record'));
    const dialog = await screen.findByRole('dialog');
    // The creator is pre-added as an owner — still removable/extendable.
    expect(within(dialog).getByText('Abha Sharma')).toBeInTheDocument();
  });
});

describe('HDIS form PPG multiselect (T10.2)', () => {
  it('picks a PPG team member from the dropdown and can remove the chip', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const dialog = await screen.findByRole('dialog');
    const input = await within(dialog).findByPlaceholderText('Add PPG team member…');
    // Only PPG team names sourced from /api/consultants are selectable — no free text.
    await userEvent.click(input);
    await userEvent.click(await within(dialog).findByText('Priya Pal'));
    expect(within(dialog).getByText('Priya Pal')).toBeInTheDocument();
    // remove the chip
    await userEvent.click(within(dialog).getByLabelText('Remove Priya Pal'));
    expect(within(dialog).queryByText('Priya Pal')).not.toBeInTheDocument();
  });
});

describe('HDIS detail + pipeline recorder (T10.3)', () => {
  it('admin can log a pipeline update (PUT called)', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601/pipeline', record, { method: 'PUT' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Record pipeline activity');
    await userEvent.click(screen.getByText('Log update'));
    const put = calls.find((c) => c.url.includes('/pipeline') && c.method === 'PUT');
    expect(put).toBeTruthy();
  });

  it('read-only user sees pipeline values but no recorder', async () => {
    mockFetch(routesFor(outsiderMe));
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Activity log');
    expect(screen.queryByText('Record pipeline activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Log update')).not.toBeInTheDocument();
  });

  it('shows the Profile Aging card with total days and per-transition breakdown', async () => {
    mockFetch(routesFor(outsiderMe));
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    expect(await screen.findByText('Profile Aging')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0); // record.aging.totalDays (0 also appears in pipeline)
    expect(screen.getByText('R0 → R1')).toBeInTheDocument();
    // Every transition is null in the fixture — rendered as an em dash.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('an owner without blanket edit rights still gets the recorder for their own record', async () => {
    const { calls } = mockFetch([
      ...routesFor(consultantMe),
      jsonRoute('/api/hdis/TST_QA_20260601/pipeline', record, { method: 'PUT' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Record pipeline activity');
    await userEvent.click(screen.getByText('Log update'));
    const put = calls.find((c) => c.url.includes('/pipeline') && c.method === 'PUT');
    expect(put).toBeTruthy();
  });
});

describe('HDIS attachments — JD link', () => {
  it('admin can save a JD link inline without opening the edit modal', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute(
        '/api/hdis/TST_QA_20260601/link',
        { ...record, jdLink: 'https://jd.example.com/qa' },
        { method: 'POST' },
      ),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Attachments');
    await userEvent.type(screen.getByLabelText('JD link'), 'https://jd.example.com/qa');
    await userEvent.click(screen.getByText('Save'));
    const posted = calls.find(
      (c) => c.url.includes('/api/hdis/TST_QA_20260601/link') && c.method === 'POST',
    );
    expect(posted).toBeTruthy();
    expect((posted!.body as { jdLink: string }).jdLink).toBe('https://jd.example.com/qa');
  });

  it('read-only user sees the JD link (if any) but no editor', async () => {
    mockFetch(routesFor(outsiderMe));
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Attachments');
    expect(screen.queryByLabelText('JD link')).not.toBeInTheDocument();
  });
});

describe('HDIS edit flow', () => {
  it('editing from the list opens a pre-filled modal and PATCHes on save', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601', record, { method: 'PATCH' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('Edit'));
    expect(await screen.findByText('Edit TST_QA_20260601')).toBeInTheDocument();
    // JD ID is read-only in edit mode.
    expect(screen.getByDisplayValue('TST_QA_20260601')).toBeDisabled();
    expect(screen.getByDisplayValue('QA Engineer')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Save changes'));
    const patch = calls.find(
      (c) => c.url.includes('/api/hdis/TST_QA_20260601') && c.method === 'PATCH',
    );
    expect(patch).toBeTruthy();
  });

  it('editing from the detail page opens the modal via "Edit record"', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601', record, { method: 'PATCH' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Activity log');
    await userEvent.click(screen.getByText('Edit record'));
    expect(await screen.findByText('Edit TST_QA_20260601')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Save changes'));
    const patch = calls.find(
      (c) => c.url.includes('/api/hdis/TST_QA_20260601') && c.method === 'PATCH',
    );
    expect(patch).toBeTruthy();
  });

  it('hides the Edit button/column for a genuine outsider', async () => {
    mockFetch(routesFor(outsiderMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('shows Edit for a record the consultant owns even without blanket edit rights', async () => {
    // record is owned by "Abha Sharma"; consultantMe shares that name (see fixture note above).
    mockFetch(routesFor(consultantMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});

describe('HDIS status reason + remarks', () => {
  // Status (and its reason) is only settable on the Edit form now — a brand-new
  // record is always born Pending server-side and has no Status field on create at
  // all (see "HDIS Pending status" below for that flow).
  it('shows a status-reason select only for On Hold / Closed, with the right options', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('Edit'));
    expect(screen.queryByText('Status reason')).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const statusSelect = within(dialog).getByLabelText('Status');
    await userEvent.selectOptions(statusSelect, 'On Hold');
    expect(screen.getByText('Status reason')).toBeInTheDocument();
    expect(screen.getByText('Hold By client')).toBeInTheDocument();
    expect(screen.getByText('Hold By VAYUZ')).toBeInTheDocument();

    await userEvent.selectOptions(statusSelect, 'Closed');
    expect(screen.getByText('Closed by VAYUZ')).toBeInTheDocument();
    expect(screen.queryByText('Hold By client')).not.toBeInTheDocument();

    await userEvent.selectOptions(statusSelect, 'Active');
    expect(screen.queryByText('Status reason')).not.toBeInTheDocument();
  });

  it('offers Fulfilled as a status with its own reason options', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('Edit'));

    const dialog = screen.getByRole('dialog');
    const statusSelect = within(dialog).getByLabelText('Status');
    expect(within(statusSelect).getByRole('option', { name: 'Fulfilled' })).toBeInTheDocument();

    await userEvent.selectOptions(statusSelect, 'Fulfilled');
    expect(screen.getByText('Status reason')).toBeInTheDocument();
    expect(screen.getByText('Fulfilled by VAYUZ')).toBeInTheDocument();
    expect(screen.getByText('Fulfilled by others')).toBeInTheDocument();
    expect(screen.queryByText('Hold By client')).not.toBeInTheDocument();
  });

  it('submits the chosen status reason and remarks on edit', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601', record, { method: 'PATCH' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('Edit'));

    const dialog = screen.getByRole('dialog');
    const statusSelect = within(dialog).getByLabelText('Status');
    await userEvent.selectOptions(statusSelect, 'On Hold');
    await userEvent.selectOptions(
      within(dialog).getByDisplayValue('Select a reason…'),
      'Hold By client',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Optional context for this record — shown on the detail page'),
      'Client paused hiring for Q3.',
    );
    await userEvent.click(screen.getByText('Save changes'));

    const patched = calls.find(
      (c) => c.url.endsWith('/api/hdis/TST_QA_20260601') && c.method === 'PATCH',
    );
    expect(patched).toBeTruthy();
    const body = patched!.body as { statusReason: string; remarks: string };
    expect(body.statusReason).toBe('Hold By client');
    expect(body.remarks).toBe('Client paused hiring for Q3.');
  });

  it('does not send status or statusReason on create — new records are always born Pending', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute(
        '/api/hdis',
        { ...record, status: 'Pending', detailsComplete: false },
        {
          method: 'POST',
        },
      ),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Status')).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('VAY_XX_20260601'), 'NEW_JD_20260701');
    await userEvent.type(
      screen.getByPlaceholderText('Optional context for this record — shown on the detail page'),
      'Client paused hiring for Q3.',
    );
    await userEvent.click(screen.getByText('Save record'));

    const posted = calls.find((c) => c.url.endsWith('/api/hdis') && c.method === 'POST');
    expect(posted).toBeTruthy();
    const body = posted!.body as Record<string, unknown>;
    expect(body.status).toBeUndefined();
    expect(body.statusReason).toBeUndefined();
    expect(body.remarks).toBe('Client paused hiring for Q3.');
  });

  it('shows remarks on the detail page when present', async () => {
    const withRemarks = {
      ...record,
      statusReason: 'Hold By VAYUZ',
      remarks: 'Waiting on budget approval.',
    };
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601/activity', []),
      jsonRoute('/api/hdis/TST_QA_20260601/candidates', []),
      jsonRoute('/api/hdis/TST_QA_20260601', withRemarks),
      jsonRoute('/api/hdis', [withRemarks]),
      jsonRoute('/api/clients', clients),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    await screen.findByText('Activity log');
    expect(screen.getByText(/Hold By VAYUZ/)).toBeInTheDocument();
    expect(screen.getByText('Waiting on budget approval.')).toBeInTheDocument();
  });
});

describe('HDIS priority', () => {
  it('shows "Uncategorised" for the default NA priority in the list', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    // "Uncategorised" also appears as an option in the Priority filter select, so
    // there's more than one match — just confirm the pill rendered somewhere.
    expect(screen.getAllByText('Uncategorised').length).toBeGreaterThan(0);
  });

  it('submits the chosen priority on create', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis', record, { method: 'POST' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Priority'), 'P1');
    await userEvent.type(screen.getByPlaceholderText('VAY_XX_20260601'), 'NEW_JD_20260702');
    await userEvent.click(screen.getByText('Save record'));

    const posted = calls.find((c) => c.url.endsWith('/api/hdis') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { priority: string }).priority).toBe('P1');
  });

  it('narrows the list by priority', async () => {
    const p1: HdisRecord = { ...record2, priority: 'P1' };
    mockFetch(routesFor(superAdminMe, [record, p1]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'P1');
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
  });
});

describe('HDIS positions', () => {
  it('shows the actual openings count as "Positions" on the detail page', async () => {
    const twoOpenings: HdisRecord = { ...record, openings: 2 };
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601/activity', []),
      jsonRoute('/api/hdis/TST_QA_20260601/candidates', []),
      jsonRoute('/api/hdis/TST_QA_20260601', twoOpenings),
      jsonRoute('/api/hdis', [twoOpenings]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis/TST_QA_20260601' },
    );
    expect(await screen.findByText('Positions')).toBeInTheDocument();
    expect(screen.queryByText('Openings')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('defaults Positions to 1 on create and submits the chosen count', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis', record, { method: 'POST' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Positions')).toHaveValue(1);
    await userEvent.clear(within(dialog).getByLabelText('Positions'));
    await userEvent.type(within(dialog).getByLabelText('Positions'), '4');
    await userEvent.type(screen.getByPlaceholderText('VAY_XX_20260601'), 'NEW_JD_20260702');
    await userEvent.click(screen.getByText('Save record'));

    const posted = calls.find((c) => c.url.endsWith('/api/hdis') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { openings: number }).openings).toBe(4);
  });

  it('pre-fills Positions on edit and PATCHes the updated count', async () => {
    const { calls } = mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis/TST_QA_20260601', record, { method: 'PATCH' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('Edit'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Positions')).toHaveValue(1);
    await userEvent.clear(within(dialog).getByLabelText('Positions'));
    await userEvent.type(within(dialog).getByLabelText('Positions'), '3');
    await userEvent.click(screen.getByText('Save changes'));

    const patch = calls.find(
      (c) => c.url.includes('/api/hdis/TST_QA_20260601') && c.method === 'PATCH',
    );
    expect(patch).toBeTruthy();
    expect((patch!.body as { openings: number }).openings).toBe(3);
  });
});

describe('HDIS filters', () => {
  it('narrows the list by client and supports Reset', async () => {
    mockFetch(routesFor(superAdminMe, [record, record2]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 records')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Client'), 'Acme Corp');
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 records')).toBeInTheDocument();

    const resetBtn = screen.getByText('Reset');
    expect(resetBtn).toBeEnabled();
    await userEvent.click(resetBtn);
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
  });

  it("narrows the list by the 'live' status filter (Active + On Hold, matching tile counts)", async () => {
    const onHoldRecord: HdisRecord = {
      ...record,
      jdId: 'TST_ONHOLD_20260604',
      title: 'On Hold Engineer',
      status: 'On Hold',
      statusReason: 'Hold By client',
    };
    const closedRecord: HdisRecord = {
      ...record,
      jdId: 'TST_CLOSED_20260605',
      title: 'Closed Engineer',
      status: 'Closed',
    };
    mockFetch(routesFor(superAdminMe, [record, onHoldRecord, closedRecord]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?status=live' },
    );
    // 'live' (Active + On Hold) should include record + onHoldRecord but not
    // closedRecord — this is the sentinel tile click-throughs use so the filtered
    // count on this page matches the tile number shown on Dhruva.
    await screen.findByText('QA Engineer');
    expect(screen.getByText('On Hold Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Closed Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 3 records')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('live');
  });

  it('narrows the list by free-text search', async () => {
    mockFetch(routesFor(superAdminMe, [record, record2]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.type(screen.getByLabelText('Search'), 'analyst');
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
  });
});

describe('HDIS filter state persists across a detail round trip', () => {
  it('keeps the applied filter after visiting a record and clicking Back to list', async () => {
    mockFetch([
      // Order matters: mockFetch's route matcher uses substring inclusion, so the more
      // specific single-record routes must be checked before the generic '/api/hdis'
      // list route (which is itself a substring of the detail/activity URLs).
      jsonRoute('/api/hdis/TST_BA_20260602/activity', []),
      jsonRoute('/api/hdis/TST_BA_20260602/candidates', []),
      jsonRoute('/api/hdis/TST_BA_20260602', record2),
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/hdis', [record, record2]),
      jsonRoute('/api/clients', clients),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.selectOptions(screen.getByLabelText('Client'), 'Acme Corp');
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Business Analyst'));
    await screen.findByText('Activity log');
    await userEvent.click(screen.getByText('← Back to list'));

    // Back on the list, the client filter (and therefore the narrowed result set) survived.
    expect(await screen.findByText('Business Analyst')).toBeInTheDocument();
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Client')).toHaveValue('Acme Corp');
  });
});

describe('HDIS fiscal year + month filter', () => {
  it('narrows by fiscal year (Apr–Mar), and the month picker is scoped to that FY', async () => {
    mockFetch(routesFor(superAdminMe, [record, record2, record3]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('UX Designer')).toBeInTheDocument();

    // Month picker starts disabled until a fiscal year is chosen.
    expect(screen.getByLabelText('Month')).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Fiscal year'), 'FY 2026-27');
    // Feb 2026 belongs to FY 2025-26, not FY 2026-27, so it drops out.
    expect(screen.queryByText('UX Designer')).not.toBeInTheDocument();
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();

    const monthSelect = screen.getByLabelText('Month');
    expect(monthSelect).toBeEnabled();
    await userEvent.selectOptions(monthSelect, 'Jun 2026');
    // Both June records remain since the month select only has one "Jun 2026" bucket.
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
  });

  it('carries a still-open requirement forward from an earlier month, but not a closed one', async () => {
    const openEarlier: HdisRecord = {
      ...record,
      jdId: 'TST_CARRY_20260501',
      title: 'Carried Forward Role',
      reqDate: '2026-05-01',
      status: 'Active',
    };
    const closedEarlier: HdisRecord = {
      ...record,
      jdId: 'TST_NOCARRY_20260502',
      title: 'Already Closed Role',
      reqDate: '2026-05-02',
      status: 'Closed',
    };
    mockFetch(routesFor(superAdminMe, [record, openEarlier, closedEarlier]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');

    await userEvent.selectOptions(screen.getByLabelText('Fiscal year'), 'FY 2026-27');
    await userEvent.selectOptions(screen.getByLabelText('Month'), 'Jun 2026');

    // June's own record, plus May's still-open one, both show...
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('Carried Forward Role')).toBeInTheDocument();
    // ...but the closed May record does not carry forward.
    expect(screen.queryByText('Already Closed Role')).not.toBeInTheDocument();
  });
});

describe('HDIS list pagination', () => {
  const manyRows: HdisRecord[] = Array.from({ length: 25 }, (_, i) => ({
    ...record,
    jdId: `TST_ROW_${String(i).padStart(2, '0')}`,
    title: `Row ${i}`,
    owners: [],
  }));

  it('shows 20 records per page and pages through the rest', async () => {
    mockFetch(routesFor(superAdminMe, manyRows));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    expect(await screen.findByText('Row 0')).toBeInTheDocument();
    expect(screen.getByText('Row 19')).toBeInTheDocument();
    expect(screen.queryByText('Row 20')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–20 of 25')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Next ›'));
    expect(await screen.findByText('Row 20')).toBeInTheDocument();
    expect(screen.getByText('Row 24')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 21–25 of 25')).toBeInTheDocument();
  });

  it('resets to page 1 when a filter narrows the results', async () => {
    mockFetch(routesFor(superAdminMe, manyRows));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('Row 0');
    await userEvent.click(screen.getByText('Next ›'));
    await screen.findByText('Row 20');

    await userEvent.type(screen.getByLabelText('Search'), 'Row 1');
    // Narrowed to Row 1, 10-19 (11 matches) — back on page 1 of the new result set.
    expect(await screen.findByText('Row 1')).toBeInTheDocument();
    expect(screen.getByText('Row 10')).toBeInTheDocument();
  });
});

describe('HDIS client master searchable select', () => {
  it('lists known clients and picks one on the add form', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const clientInput = await screen.findByPlaceholderText('Start typing a client name…');
    await userEvent.type(clientInput, 'Acme');
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Acme Corp'));
    expect(screen.getByPlaceholderText('Start typing a client name…')).toHaveValue('Acme Corp');
  });
});

const pendingRecord: HdisRecord = {
  ...record,
  jdId: 'TST_PEND_20260701',
  title: 'Backend Engineer',
  status: 'Pending',
  detailsComplete: false,
  requirementDetail: null,
};

describe('HDIS Pending status + requirement questionnaire', () => {
  it('creating a record opens the requirement questionnaire automatically', async () => {
    mockFetch([
      ...routesFor(superAdminMe),
      jsonRoute('/api/hdis', pendingRecord, { method: 'POST' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    await userEvent.type(screen.getByPlaceholderText('VAY_XX_20260601'), 'TST_PEND_20260701');
    await userEvent.click(screen.getByText('Save record'));

    expect(await screen.findByText('Requirement details — TST_PEND_20260701')).toBeInTheDocument();
    expect(screen.getByText(/no attachment yet/)).toBeInTheDocument();
    expect(screen.getByText(/0\/22 required fields/)).toBeInTheDocument();
  });

  it('Active is disabled on the edit form until the questionnaire is complete', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('Backend Engineer');
    await userEvent.click(screen.getByText('Edit'));
    const dialog = screen.getByRole('dialog');
    const statusSelect = within(dialog).getByLabelText('Status') as HTMLSelectElement;
    const activeOption = within(statusSelect).getByRole('option', {
      name: 'Active',
    }) as HTMLOptionElement;
    expect(activeOption.disabled).toBe(true);
    expect(
      screen.getByText('Complete the requirement questionnaire to unlock Active.'),
    ).toBeInTheDocument();
  });

  it('Active is NOT disabled for an On Hold record, even with an incomplete questionnaire — the gate is only for a first activation out of Pending', async () => {
    const onHoldRecord: HdisRecord = {
      ...pendingRecord,
      jdId: 'TST_ONHOLD_20260702',
      status: 'On Hold',
      statusReason: 'Hold By VAYUZ',
    };
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${onHoldRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${onHoldRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${onHoldRecord.jdId}`, onHoldRecord),
      jsonRoute('/api/hdis', [onHoldRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis?fy=&month=' },
    );
    await screen.findByText('Backend Engineer');
    await userEvent.click(screen.getByText('Edit'));
    const dialog = screen.getByRole('dialog');
    const statusSelect = within(dialog).getByLabelText('Status') as HTMLSelectElement;
    const activeOption = within(statusSelect).getByRole('option', {
      name: 'Active',
    }) as HTMLOptionElement;
    expect(activeOption.disabled).toBe(false);
    expect(
      screen.queryByText('Complete the requirement questionnaire to unlock Active.'),
    ).not.toBeInTheDocument();
  });

  it('saving the questionnaire PUTs the entered values to /hdis/:jdId/details', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/details`, pendingRecord, { method: 'PUT' }),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));
    await userEvent.type(screen.getByLabelText('BIG member name *'), 'Abha Sharma');
    await userEvent.click(screen.getByText('Save draft'));

    const put = calls.find(
      (c) => c.url.endsWith(`/api/hdis/${pendingRecord.jdId}/details`) && c.method === 'PUT',
    );
    expect(put).toBeTruthy();
    expect((put!.body as { bigMemberName: string }).bigMemberName).toBe('Abha Sharma');
  });

  it('the questionnaire modal offers a way to reach the Attachments card', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));
    expect(await screen.findByText(/no attachment yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Go to record to attach a file →'));

    // Modal closed and the page's own Attachments card (upload input included) is
    // now reachable — this is the one place a document can actually be attached.
    expect(screen.queryByText(/Save draft|Save details/)).not.toBeInTheDocument();
    expect(await screen.findByText('Attachments')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload attachment')).toBeInTheDocument();
  });

  it('does not close the questionnaire on backdrop click when dirty and the user cancels the confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));
    await userEvent.type(screen.getByLabelText('BIG member name *'), 'Abha Sharma');

    const dialog = screen.getByRole('dialog');
    await userEvent.click(dialog);

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText('Requirement details — TST_PEND_20260701')).toBeInTheDocument();
  });

  it('closes the questionnaire on Close when dirty and the user confirms discard', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));
    await userEvent.type(screen.getByLabelText('BIG member name *'), 'Abha Sharma');

    await userEvent.click(screen.getByText('Close'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText('Requirement details — TST_PEND_20260701')).not.toBeInTheDocument();
  });

  it('closes the questionnaire without confirming when nothing has been typed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));

    await userEvent.click(screen.getByText('Close'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Requirement details — TST_PEND_20260701')).not.toBeInTheDocument();
  });

  it('a saved draft reopens pre-filled for further editing, and closing right after a save does not prompt', async () => {
    const savedDraft: RequirementDetail = {
      bigMemberName: 'Abha Sharma',
      requirementsReceived: null,
      requirementName: null,
      engagementType: null,
      clientType: null,
      roleBackground: null,
      positionOpenDuration: null,
      hiringDeadline: null,
      interviewRoundsCount: null,
      interviewRoundsDefinition: null,
      positionsAlreadyFilled: null,
      clientAttemptedInternalHiring: null,
      internalHiringDuration: null,
      internalHiringChannels: null,
      internalHiringStageReached: null,
      internalHiringChallenges: null,
      ctcBlockerGap: null,
      maxNoticePeriod: null,
      targetCompaniesSuggested: null,
      vayuzExclusive: null,
      vendorCount: null,
      vendorsSharingProfiles: null,
      vendorSubmissionDuration: null,
      duplicateProfileTimeline: null,
      commercialRates: null,
      clientPocDetails: null,
      additionalInsights: null,
      closureConfidence: null,
      exceptionNotes: null,
      atsUsed: null,
      isComplete: false,
    };
    const draftRecord: HdisRecord = { ...pendingRecord, requirementDetail: savedDraft };
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${draftRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${draftRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${draftRecord.jdId}`, draftRecord),
      jsonRoute('/api/hdis', [draftRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
      jsonRoute(`/api/hdis/${draftRecord.jdId}/details`, draftRecord, { method: 'PUT' }),
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${draftRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    await userEvent.click(screen.getByText('Requirement details'));

    // Reopening the draft loads the previously saved value back into the form.
    expect(screen.getByLabelText('BIG member name *')).toHaveValue('Abha Sharma');

    await userEvent.click(screen.getByText('Save draft'));
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);

    await userEvent.click(screen.getByText('Close'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shows a Pending banner on the detail page with a completion CTA', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/activity`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}/candidates`, []),
      jsonRoute(`/api/hdis/${pendingRecord.jdId}`, pendingRecord),
      jsonRoute('/api/hdis', [pendingRecord]),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(
      <Routes>
        <Route path="/hdis/:jdId" element={<HdisPage />} />
      </Routes>,
      { route: `/hdis/${pendingRecord.jdId}` },
    );
    await screen.findAllByText('Backend Engineer');
    expect(screen.getByText('Not active yet')).toBeInTheDocument();
    expect(screen.getByText('Complete requirement details')).toBeInTheDocument();
  });
});
