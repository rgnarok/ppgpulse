import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe, consultantMe } from '../../tests/utils';
import ClientsPage from './ClientsPage';

vi.stubGlobal('confirm', () => true);

const clients = [
  { id: 'c1', name: 'Acme Corp', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'c2', name: 'Testify', createdAt: '2026-06-02T00:00:00.000Z' },
];

function renderPage(me = superAdminMe) {
  mockFetch([jsonRoute('/api/me', me), jsonRoute('/api/clients', clients)]);
  return renderApp(
    <Routes>
      <Route path="/admin/clients" element={<ClientsPage />} />
    </Routes>,
    { route: '/admin/clients' },
  );
}

describe('Clients admin page', () => {
  it('lists the client master and adds a new client', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/clients', clients),
      jsonRoute(
        '/api/clients',
        { id: 'c3', name: 'New Co', createdAt: '2026-07-01T00:00:00.000Z' },
        {
          method: 'POST',
        },
      ),
    ]);
    renderApp(
      <Routes>
        <Route path="/admin/clients" element={<ClientsPage />} />
      </Routes>,
      { route: '/admin/clients' },
    );
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Testify')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('New client name'), 'New Co');
    await userEvent.click(screen.getByText('+ Add'));

    const posted = calls.find((c) => c.url.endsWith('/api/clients') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { name: string }).name).toBe('New Co');
  });

  it('edits a client name inline', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/clients', clients),
      jsonRoute(
        '/api/clients/c1',
        { id: 'c1', name: 'Acme Corporation', createdAt: clients[0].createdAt },
        {
          method: 'PATCH',
        },
      ),
    ]);
    renderApp(
      <Routes>
        <Route path="/admin/clients" element={<ClientsPage />} />
      </Routes>,
      { route: '/admin/clients' },
    );
    await screen.findByText('Acme Corp');
    await userEvent.click(screen.getAllByText('Edit')[0]);
    const input = screen.getByDisplayValue('Acme Corp');
    await userEvent.clear(input);
    await userEvent.type(input, 'Acme Corporation');
    await userEvent.click(screen.getByText('Save'));

    const patched = calls.find((c) => c.url.endsWith('/api/clients/c1') && c.method === 'PATCH');
    expect(patched).toBeTruthy();
    expect((patched!.body as { name: string }).name).toBe('Acme Corporation');
  });

  it('removes a client after confirming', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/clients/c1', {}, { method: 'DELETE', status: 204 }),
    ]);
    renderApp(
      <Routes>
        <Route path="/admin/clients" element={<ClientsPage />} />
      </Routes>,
      { route: '/admin/clients' },
    );
    await screen.findByText('Acme Corp');
    await userEvent.click(screen.getAllByText('Remove')[0]);

    const deleted = calls.find((c) => c.url.endsWith('/api/clients/c1') && c.method === 'DELETE');
    expect(deleted).toBeTruthy();
  });

  it('filters the list via search', async () => {
    renderPage();
    await screen.findByText('Acme Corp');
    await userEvent.type(screen.getByLabelText('Search'), 'test');
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expect(screen.getByText('Testify')).toBeInTheDocument();
  });

  it('is hidden from a consultant (no hdis:edit capability, even though they can add HDIS records)', () => {
    // Purely a sanity check on the fixture — the actual route gating is exercised at
    // the App.tsx / permissions.ts level for nav + Protected route visibility.
    // Consultants have hdis:add (to log their own JDs) but not hdis:edit, so the
    // standalone client-master admin screen (gated on 'edit') stays admin-only.
    expect(consultantMe.permissions.hdis).toContain('add');
    expect(consultantMe.permissions.hdis).not.toContain('edit');
  });
});
