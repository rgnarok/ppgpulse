import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { makeQueryClient } from '../lib/queryClient';
import { AuthProvider } from '../lib/auth';
import type { Me } from '../lib/types';

export const superAdminMe: Me = {
  id: 'u_kb',
  name: 'Kushagra Bindra',
  email: 'kushagra@vayuz.com',
  team: 'Leadership',
  managerId: null,
  isActive: true,
  role: { key: 'super_admin', label: 'Super Admin', sub: 'Co-Founder', scope: 'org' },
  scope: 'org',
  hasReports: false,
  permissions: {
    home: ['view'],
    interviews: ['view', 'edit'],
    hdis: ['view', 'add', 'edit', 'delete'],
    myteam: ['view'],
    profile: ['view', 'edit'],
    users: ['view', 'edit'],
    roles: ['view', 'edit'],
    hierarchy: ['view', 'edit'],
    auditlog: ['view'],
    dhruva: ['view'],
    kpis: ['view', 'add', 'edit', 'delete'],
  },
  consultant: null,
};

export const consultantMe: Me = {
  id: 'u_abha',
  name: 'Abha Sharma',
  email: 'abha@vayuz.com',
  team: 'Pod A',
  managerId: 'u_aarti',
  isActive: true,
  role: { key: 'consultant', label: 'Consultant', sub: 'PPG', scope: 'team' },
  scope: 'team',
  hasReports: false,
  permissions: {
    home: ['view'],
    interviews: ['view', 'edit'],
    // Consultants can add HDIS records for their own JDs, but not blanket-edit —
    // matches the real seeded 'consultant' role (SPEC.md §2).
    hdis: ['view', 'add'],
    myteam: ['view'],
    profile: ['view', 'edit'],
  },
  consultant: { id: 'c_abha', pod: 'Pod A', eventsHosted: 4, eventsParticipated: 1, insights: 6 },
};

export interface Route {
  match: (url: string, method: string) => boolean;
  respond: (url: string, init?: RequestInit) => { status?: number; body: unknown };
}

/** Install a fetch mock that dispatches to the first matching route. */
export function mockFetch(routes: Route[]) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes.find((r) => r.match(url, method));
    const result = route ? route.respond(url, init) : { status: 404, body: { error: 'not_found' } };
    const status = result.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
      headers: new Map(),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export function jsonRoute(
  path: string,
  body: unknown,
  opts: { method?: string; status?: number } = {},
): Route {
  return {
    match: (url, method) => url.includes(path) && method === (opts.method ?? 'GET'),
    respond: () => ({ status: opts.status, body }),
  };
}

/** Render with query + router + auth providers. Seeds a token so /me loads. */
export function renderApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  localStorage.setItem('ppg_access', 'test-access');
  localStorage.setItem('ppg_refresh', 'test-refresh');
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
