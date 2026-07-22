import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../../tests/utils';
import KpisPage from './KpisPage';

const kpis = [
  {
    id: 'k1',
    kpiNo: 1,
    symbol: '🗂️',
    title: 'Trello-based Day Planning',
    target: '100%',
    description: 'Plan every day in Trello.',
    periodicity: 'Daily',
    whyItMatters: 'Ensures transparency.',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'k2',
    kpiNo: 4,
    symbol: '➕',
    title: 'Total Profiles Shared',
    target: '≥ 12 / day',
    description: 'Daily submission of quality candidate profiles.',
    periodicity: 'Daily',
    whyItMatters: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

function renderPage() {
  return renderApp(
    <Routes>
      <Route path="/admin/kpis" element={<KpisPage />} />
    </Routes>,
    { route: '/admin/kpis' },
  );
}

describe('KPIs admin page', () => {
  it('lists KPIs from the scorecard master list', async () => {
    mockFetch([jsonRoute('/api/me', superAdminMe), jsonRoute('/api/kpis', kpis)]);
    renderPage();

    expect(await screen.findByText('Trello-based Day Planning')).toBeInTheDocument();
    expect(screen.getByText('Total Profiles Shared')).toBeInTheDocument();
    expect(screen.getByText('≥ 12 / day')).toBeInTheDocument();
    expect(screen.getAllByText('Daily').length).toBeGreaterThan(0);
  });

  it('adds a new KPI via the modal', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/kpis', kpis),
      jsonRoute(
        '/api/kpis',
        {
          id: 'k3',
          kpiNo: 9,
          symbol: '📘',
          title: 'New KPI',
          target: '≥ 80%',
          description: 'x',
          periodicity: 'Monthly',
          whyItMatters: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        { method: 'POST' },
      ),
    ]);
    renderPage();
    await screen.findByText('Trello-based Day Planning');

    await user.click(screen.getByText('+ Add KPI'));
    const dialog = await screen.findByRole('dialog', { name: 'Add KPI' });
    await user.type(within(dialog).getByLabelText('KPI No.'), '9');
    await user.type(within(dialog).getByLabelText('Symbol'), '📘');
    await user.type(within(dialog).getByLabelText('Title'), 'New KPI');
    await user.type(within(dialog).getByLabelText('Target'), '≥ 80%');
    await user.type(within(dialog).getByLabelText('Description'), 'x');
    await user.click(within(dialog).getByText('Save KPI'));

    const posted = calls.find((c) => c.url.endsWith('/api/kpis') && c.method === 'POST');
    expect(posted).toBeTruthy();
    const body = posted!.body as { kpiNo: number; title: string; periodicity: string };
    expect(body.kpiNo).toBe(9);
    expect(body.title).toBe('New KPI');
    expect(body.periodicity).toBe('Daily');
  });

  it('opens the edit modal pre-filled and PATCHes on save', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/kpis', kpis),
      jsonRoute('/api/kpis/k1', { ...kpis[0], target: '95%' }, { method: 'PATCH' }),
    ]);
    renderPage();
    await screen.findByText('Trello-based Day Planning');

    await user.click(screen.getAllByText('Edit')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit KPI' });
    const targetInput = within(dialog).getByLabelText('Target');
    expect(targetInput).toHaveValue('100%');
    await user.clear(targetInput);
    await user.type(targetInput, '95%');
    await user.click(within(dialog).getByText('Save changes'));

    const patched = calls.find((c) => c.url.endsWith('/api/kpis/k1') && c.method === 'PATCH');
    expect(patched).toBeTruthy();
    expect((patched!.body as { target: string }).target).toBe('95%');
  });

  it('removes a KPI after confirming in the delete modal', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/kpis', kpis),
      jsonRoute('/api/kpis/k1', {}, { method: 'DELETE', status: 204 }),
    ]);
    renderPage();
    await screen.findByText('Trello-based Day Planning');

    await user.click(screen.getAllByText('Remove')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Remove KPI' });
    await user.click(within(dialog).getByText('Remove'));

    const deleted = calls.find((c) => c.url.endsWith('/api/kpis/k1') && c.method === 'DELETE');
    expect(deleted).toBeTruthy();
  });
});
