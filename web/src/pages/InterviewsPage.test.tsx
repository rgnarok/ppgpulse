import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, consultantMe } from '../tests/utils';
import InterviewsPage from './InterviewsPage';
import type { Me } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

const day = { date: '2026-06-10', mid: [], end: [], byConsultant: [] };
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

describe('Interviews (T9.1)', () => {
  it('adding a row calls the create API', async () => {
    const { calls } = mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute('/api/interviews/day/2026-06-10', day),
      jsonRoute('/api/interviews', { month: '2026-06', counts: {}, total: 0 }),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/interviews', { id: 'iv1' }, { method: 'POST' }),
    ]);
    renderApp(<InterviewsPage />);

    // Select day 10 on the June calendar.
    await screen.findByText('2026-06');
    const cell = screen.getByText('10');
    await userEvent.click(cell);

    const candidate = await screen.findByPlaceholderText('Name');
    await userEvent.type(candidate, 'Jane Doe');
    await userEvent.click(screen.getByText('+ Add interview'));

    const posted = calls.find((c) => c.url.endsWith('/api/interviews') && c.method === 'POST');
    expect(posted).toBeTruthy();
    expect((posted!.body as { candidate: string }).candidate).toBe('Jane Doe');
  });

  it('read-only user sees no add form', async () => {
    const readOnly: Me = {
      ...consultantMe,
      permissions: { ...consultantMe.permissions, interviews: ['view'] },
    };
    mockFetch([
      jsonRoute('/api/me', readOnly),
      jsonRoute('/api/interviews/day/2026-06-10', day),
      jsonRoute('/api/interviews', { month: '2026-06', counts: {}, total: 0 }),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText('2026-06');
    await userEvent.click(screen.getByText('10'));
    // Day panel renders, but no add form.
    const heading = await screen.findByText('2026-06-10');
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText('+ Add interview')).not.toBeInTheDocument();
  });
});
