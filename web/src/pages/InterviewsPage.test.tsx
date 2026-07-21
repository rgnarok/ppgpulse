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

const clients = [
  { id: 'cl1', name: 'Testify', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'cl2', name: 'Acme Corp', createdAt: '2026-06-01T00:00:00.000Z' },
];
const hdisRecords = [
  {
    jdId: 'TST_QA_20260601',
    title: 'QA Engineer',
    client: 'Testify',
    type: 'RADC',
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
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

describe('Interviews — Add interview modal Client + Profile (HDIS)', () => {
  it('lists Client from the client master and Profile from the caller’s HDIS records, auto-filling client on pick', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/hdis', hdisRecords),
      jsonRoute('/api/interviews', { id: 'iv1' }, { method: 'POST' }),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);
    await user.click(screen.getByText('+ Add interview'));
    const dialog = await screen.findByRole('dialog', { name: 'Add interview' });

    // Client is a plain select sourced from the client master.
    const clientSelect = within(dialog).getByLabelText('Client');
    expect(within(clientSelect).getByText('Testify')).toBeInTheDocument();
    expect(within(clientSelect).getByText('Acme Corp')).toBeInTheDocument();

    // Profile is a search-as-you-type field over the caller's (RBAC-scoped) HDIS records.
    await user.type(within(dialog).getByPlaceholderText('Name'), 'Jane Doe');
    const profileInput = within(dialog).getByLabelText('Profile');
    await user.type(profileInput, 'QA');
    const option = await within(dialog).findByText('QA Engineer — Testify (TST_QA_20260601)');
    await user.click(option);
    // Picking the HDIS profile auto-fills the client, still overridable.
    expect((clientSelect as HTMLSelectElement).value).toBe('Testify');
    expect((profileInput as HTMLInputElement).value).toBe(
      'QA Engineer — Testify (TST_QA_20260601)',
    );

    await user.click(within(dialog).getByText('Save interview'));

    const posted = calls.find((c) => c.url.endsWith('/api/interviews') && c.method === 'POST');
    const body = posted!.body as {
      client: string;
      profile: string;
      requirementRef: string;
    };
    expect(body.client).toBe('Testify');
    expect(body.profile).toBe('QA Engineer');
    expect(body.requirementRef).toBe('TST_QA_20260601');
  });
});

describe('Interviews — Edit interview', () => {
  const existingInterview = {
    id: 'iv1',
    date: TODAY,
    session: 'mid' as const,
    type: 'RAPYD(C)',
    candidate: 'Jane Doe',
    candidateEmail: null,
    ref: '2026090701',
    round: 'L1',
    client: 'Testify',
    profile: 'QA Engineer',
    requirementRef: 'TST_QA_20260601',
    interviewer: 'Ravi',
    ppgConsultantId: 'c_abha',
    ppgConsultantName: 'Abha Sharma',
    stage: null,
    status: 'Scheduled',
    time: '12:30 PM',
    createdByName: 'Abha Sharma',
  };

  it('shows an Edit action alongside Remove, and opens a pre-filled modal that PATCHes on save', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, {
        date: TODAY,
        mid: [existingInterview],
        end: [],
        byConsultant: [],
      }),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
      jsonRoute('/api/clients', clients),
      jsonRoute('/api/hdis', hdisRecords),
      jsonRoute('/api/interviews/iv1', { id: 'iv1' }, { method: 'PATCH' }),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);
    await screen.findByText('Jane Doe');

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();

    await user.click(screen.getByText('Edit'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit interview' });

    // Pre-filled from the existing row. The Profile field's search input shows the
    // interview's already-stored profile text immediately (via SearchableOptionSelect's
    // fallbackLabel) — it doesn't wait on the HDIS list fetch to resolve first.
    expect(within(dialog).getByPlaceholderText('Name')).toHaveValue('Jane Doe');
    expect(within(dialog).getByLabelText('Profile')).toHaveValue('QA Engineer');
    expect(within(dialog).getByText('Save changes')).toBeInTheDocument();

    await user.clear(within(dialog).getByPlaceholderText('12:30 PM'));
    await user.type(within(dialog).getByPlaceholderText('12:30 PM'), '2:00 PM');
    await user.click(within(dialog).getByText('Save changes'));

    const patched = calls.find(
      (c) => c.url.endsWith('/api/interviews/iv1') && c.method === 'PATCH',
    );
    expect(patched).toBeTruthy();
    const body = patched!.body as { time: string };
    expect(body.time).toBe('2:00 PM');
  });
});

describe('Interviews — Add interview modal confirm-before-discard', () => {
  async function openModalWithCandidateTyped() {
    const user = userEvent.setup({ delay: null });
    mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);
    await user.click(screen.getByText('+ Add interview'));
    const dialog = await screen.findByRole('dialog', { name: 'Add interview' });
    await user.type(within(dialog).getByPlaceholderText('Name'), 'Jane Doe');
    return { user, dialog };
  }

  it('does not close on backdrop click when dirty and the user cancels the confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, dialog } = await openModalWithCandidateTyped();

    // Click the backdrop itself (the dialog root), not the inner card.
    await user.click(dialog);

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Add interview' })).toBeInTheDocument();
  });

  it('closes on X button when dirty and the user confirms discard', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await openModalWithCandidateTyped();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Add interview' })).not.toBeInTheDocument();
  });

  it('closes Cancel without confirming when the form is untouched', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup({ delay: null });
    mockFetch([
      jsonRoute('/api/me', consultantMe),
      jsonRoute(`/api/interviews/day/${TODAY}`, emptyDay(TODAY)),
      jsonRoute('/api/interviews', monthCounts),
      jsonRoute('/api/consultants', consultants),
    ]);
    renderApp(<InterviewsPage />);
    await screen.findByText(TODAY_LABEL);
    await user.click(screen.getByText('+ Add interview'));
    await screen.findByRole('dialog', { name: 'Add interview' });

    await user.click(screen.getByText('Cancel'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Add interview' })).not.toBeInTheDocument();
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
