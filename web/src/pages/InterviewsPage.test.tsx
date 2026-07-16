import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, consultantMe, superAdminMe } from '../tests/utils';
import InterviewsPage from './InterviewsPage';
import type { Me } from '../lib/types';
import { formatDate, formatMonth } from '../lib/format';

// "Today" is pinned to a Wednesday so the default week strip (Sun 06-07 → Sat 06-13)
// stays within a single month, keeping the mocked routes simple.
const TODAY = '2026-06-10';
const TODAY_LABEL = formatDate(TODAY);

beforeEach(() => {
  // `shouldAdvanceTime` keeps real timers running (so RTL's async `findBy*`/`waitFor`
  // still resolve) while `Date` itself stays pinned to TODAY.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const emptyDay = (date: string) => ({ date, mid: [], end: [], byConsultant: [] });
const monthCounts = { month: '2026-06', counts: {}, total: 0 };
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
    id: 'c_vanya',
    userId: 'u_vanya',
    name: 'Vanya Parihar',
    email: 'v@vayuz.com',
    pod: 'Pod C',
    team: 'Pod C',
    eventsHosted: 0,
    eventsParticipated: 0,
    insights: 0,
  },
];

describe('Interviews — default week view (T9.1)', () => {
  it('opens with today selected and adding a row calls the create API via the modal', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/interviews', { id: 'iv1' }, { method: 'POST' }),
    ]);
    renderApp(<InterviewsPage />);

    // Today's date heading renders below the calendar without needing a click.
    expect(await screen.findByText(TODAY_LABEL)).toBeInTheDocument();

    await user.click(screen.getByText('+ Add interview'));
    const dialog = await screen.findByRole('dialog', { name: 'Add interview' });
    const candidate = within(dialog).getByPlaceholderText('Name');
    await user.type(candidate, 'Jane Doe');
    const typeSelect = within(dialog)
      .getAllByRole('combobox')
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'RAPYD(C)'),
      )!;
    await user.selectOptions(typeSelect, 'RAPYD(C)');
    await user.click(within(dialog).getByText('Save interview'));

    const posted = calls.find((c) => c.url.endsWith('/api/interviews') && c.method === 'POST');
    expect(posted).toBeTruthy();
    const body = posted!.body as { candidate: string; date: string; type: string };
    expect(body.candidate).toBe('Jane Doe');
    expect(body.date).toBe(TODAY);
    expect(body.type).toBe('RAPYD(C)');
  });

  it('read-only user sees no add button', async () => {
    const readOnly: Me = {
      ...consultantMe,
      permissions: { ...consultantMe.permissions, interviews: ['view'] },
    };
    mockFetch([
      jsonRoute('/api/me', readOnly),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    expect(await screen.findByText(TODAY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText('+ Add interview')).not.toBeInTheDocument();
  });
});

describe('Interviews — calendar (month) view', () => {
  it('switching to calendar view and picking a date loads that day below the calendar', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews/day/2026-06-15', emptyDay('2026-06-15')),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);

    await user.click(screen.getByText('Calendar view'));
    expect(await screen.findByText(formatMonth('2026-06'))).toBeInTheDocument();

    await user.click(screen.getByText('15'));
    expect(await screen.findByText(formatDate('2026-06-15'))).toBeInTheDocument();
  });
});

describe('Interviews — role-scoped filters', () => {
  it('shows a team filter for org-scope users', async () => {
    mockFetch([
      jsonRoute('/api/me', superAdminMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    const teamSelect = await screen.findByLabelText('Team');
    expect(within(teamSelect).getByText('All teams')).toBeInTheDocument();
    expect(within(teamSelect).getByText('Pod A')).toBeInTheDocument();
    expect(within(teamSelect).getByText('Pod C')).toBeInTheDocument();
    // Team-scope / own-scope filters shouldn't render for an org-scope user.
    expect(screen.queryByLabelText('Team member')).not.toBeInTheDocument();
  });

  it('shows a team-member filter for team-scope users, and none for own-scope users', async () => {
    mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    const memberSelect = await screen.findByLabelText('Team member');
    expect(within(memberSelect).getByText('My team')).toBeInTheDocument();
    expect(within(memberSelect).getByText('Abha Sharma')).toBeInTheDocument();
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
  });

  it('own-scope users see neither filter', async () => {
    const ownScopeMe: Me = {
      ...consultantMe,
      role: { key: 'user', label: 'User', sub: 'PPG', scope: 'own' },
      scope: 'own',
    };
    mockFetch([
      jsonRoute('/api/me', ownScopeMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Team member')).not.toBeInTheDocument();
  });
});
