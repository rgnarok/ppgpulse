import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe, consultantMe } from '../tests/utils';
import HdisPage from './HdisPage';
import type { HdisRecord, Me } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

// consultantMe (name "Abha Sharma") is deliberately the *owner* of `record` below, so
// it doubles as the "owner without blanket edit" fixture. A genuine outsider — same
// team-scope role, but not listed as an owner of anything — needs a separate identity.
const outsiderMe: Me = { ...consultantMe, id: 'u_outsider', name: 'Someone Else' };

const record: HdisRecord = {
  jdId: 'TST_QA_20260601',
  title: 'QA Engineer',
  client: 'Testify',
  type: 'RADC',
  openings: 1,
  status: 'Active',
  priority: 'NA',
  confidence: 'Medium',
  reqDate: '2026-06-01',
  jdLink: null,
  owners: ['Abha Sharma'],
  pipeline: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, stage: 'R0 · Sourcing' },
  attachments: [],
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

function routesFor(role: typeof superAdminMe, rows: HdisRecord[] = [record]) {
  return [
    jsonRoute('/api/me', role),
    jsonRoute('/api/hdis/TST_QA_20260601/activity', []),
    jsonRoute('/api/hdis/TST_QA_20260601', record),
    jsonRoute('/api/hdis', rows),
    jsonRoute('/api/clients', clients),
  ];
}

describe('HDIS list (T10.1)', () => {
  it('renders records and shows Add for an admin', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
    );
    expect(await screen.findByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('+ Add record')).toBeInTheDocument();
  });

  it('hides Add for a consultant (read-only)', async () => {
    mockFetch(routesFor(consultantMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.queryByText('+ Add record')).not.toBeInTheDocument();
  });
});

describe('HDIS form owners multiselect (T10.2)', () => {
  it('adds and removes owner chips', async () => {
    mockFetch(routesFor(superAdminMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
    );
    await screen.findByText('QA Engineer');
    await userEvent.click(screen.getByText('+ Add record'));
    const input = await screen.findByPlaceholderText('Add owner + Enter');
    await userEvent.type(input, 'Priya Pal{enter}');
    expect(screen.getByText('Priya Pal')).toBeInTheDocument();
    // remove the chip
    await userEvent.click(screen.getByText('×'));
    expect(screen.queryByText('Priya Pal')).not.toBeInTheDocument();
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
      { route: '/hdis' },
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
      { route: '/hdis' },
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
      { route: '/hdis' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});

describe('HDIS filters', () => {
  it('narrows the list by client and supports Reset', async () => {
    mockFetch(routesFor(superAdminMe, [record, record2]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
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

  it('narrows the list by free-text search', async () => {
    mockFetch(routesFor(superAdminMe, [record, record2]));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
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
      { route: '/hdis' },
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
      { route: '/hdis' },
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
      { route: '/hdis' },
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
      { route: '/hdis' },
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
      { route: '/hdis' },
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
