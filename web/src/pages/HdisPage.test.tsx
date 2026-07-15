import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe, consultantMe } from '../tests/utils';
import HdisPage from './HdisPage';
import type { HdisRecord } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

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
    mockFetch(routesFor(consultantMe));
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

  it('hides the Edit button/column for read-only users', async () => {
    mockFetch(routesFor(consultantMe));
    renderApp(
      <Routes>
        <Route path="/hdis" element={<HdisPage />} />
      </Routes>,
      { route: '/hdis' },
    );
    await screen.findByText('QA Engineer');
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
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
