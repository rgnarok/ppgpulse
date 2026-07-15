import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Empty, Btn } from '../components/ui';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import {
  useConsultants,
  useInterviewMonth,
  useInterviewMonths,
  useInterviewDay,
  useApiMutation,
  type InterviewRow,
  type InterviewScopeFilter,
} from '../lib/hooks';
import { formatDate, formatMonth } from '../lib/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROUND_OPTIONS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const STATUS_OPTIONS = ['Scheduled', 'Selected', 'Rejected', 'On Hold'];

// ---- calendar-day arithmetic (plain YYYY-MM-DD strings, no real timezone conversion) ----
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toUTCDate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUTCDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function addDays(dateISO: string, n: number): string {
  const d = toUTCDate(dateISO);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTCDate(d);
}
/** The Sun–Sat week (7 ISO dates) containing `anchorISO`. */
function weekDates(anchorISO: string): string[] {
  const dow = toUTCDate(anchorISO).getUTCDay();
  const sunday = addDays(anchorISO, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

function cellClass(date: string, count: number | undefined, selected: string, today: string) {
  return [
    'cal-c',
    count ? 'has' : '',
    date === today ? 'today' : '',
    date === selected ? 'sel' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function statusTone(status: string | null): string {
  switch (status) {
    case 'Selected':
      return 'p-green';
    case 'Rejected':
      return 'p-amber';
    case 'On Hold':
      return 'p-grey';
    default:
      return 'p-blue';
  }
}

export default function InterviewsPage() {
  const { me } = useAuth();
  const editable = can(me, 'interviews', 'edit');
  const today = useMemo(() => todayISO(), []);

  // Deep link from elsewhere (e.g. the Home dashboard's "Interviews this month" card):
  // ?view=month&month=YYYY-MM opens straight into that month's calendar.
  const [params] = useSearchParams();
  const deepLinkMonth = params.get('view') === 'month' ? params.get('month') : null;
  const initialDate =
    deepLinkMonth && /^\d{4}-\d{2}$/.test(deepLinkMonth) ? `${deepLinkMonth}-01` : today;

  const [viewMode, setViewMode] = useState<'week' | 'month'>(deepLinkMonth ? 'month' : 'week');
  const [anchor, setAnchor] = useState(initialDate);
  const [selected, setSelected] = useState(initialDate);
  const [addOpen, setAddOpen] = useState(false);

  // Super admins/HR (org scope) filter by team; team-scope roles filter down to one of
  // their own team members; own-scope users see only their own rows — no filter shown.
  const [teamFilter, setTeamFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const { data: consultants = [] } = useConsultants();
  const teams = useMemo(
    () => [...new Set(consultants.map((c) => c.team))].sort((a, b) => a.localeCompare(b)),
    [consultants],
  );
  const filter: InterviewScopeFilter = useMemo(() => {
    if (me?.scope === 'org') return teamFilter ? { team: teamFilter } : {};
    if (me?.scope === 'team') return memberFilter ? { consultantId: memberFilter } : {};
    return {};
  }, [me?.scope, teamFilter, memberFilter]);

  const wDates = useMemo(() => weekDates(anchor), [anchor]);
  const wMonths = useMemo(() => [...new Set(wDates.map((d) => d.slice(0, 7)))], [wDates]);
  const { counts: weekCounts } = useInterviewMonths(wMonths, filter);

  const month = anchor.slice(0, 7);
  const { data: monthData } = useInterviewMonth(month, filter);
  const mCounts = monthData?.counts ?? {};

  function goToday() {
    setAnchor(today);
    setSelected(today);
  }

  return (
    <AppShell title="Interviews" subtitle="Weekly &amp; monthly calendar with per-day logs">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'week' ? 'btn-pri' : 'btn-gho'}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'month' ? 'btn-pri' : 'btn-gho'}`}
              onClick={() => setViewMode('month')}
            >
              Calendar view
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {me?.scope === 'org' && (
              <div className="field">
                <label htmlFor="iv-team">Team</label>
                <select
                  id="iv-team"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                >
                  <option value="">All teams</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {me?.scope === 'team' && (
              <div className="field">
                <label htmlFor="iv-member">Team member</label>
                <select
                  id="iv-member"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                >
                  <option value="">My team</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === 'week' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-gho btn-sm"
                  onClick={() => setAnchor(addDays(anchor, -7))}
                >
                  ‹ Prev
                </button>
                <button type="button" className="btn btn-gho btn-sm" onClick={goToday}>
                  Today
                </button>
                <button
                  type="button"
                  className="btn btn-gho btn-sm"
                  onClick={() => setAnchor(addDays(anchor, 7))}
                >
                  Next ›
                </button>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="iv-month">Month</label>
                <input
                  id="iv-month"
                  type="month"
                  value={month}
                  onChange={(e) => setAnchor(`${e.target.value}-01`)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Card>
        <SectionTitle>
          {viewMode === 'week' ? `Week of ${formatDate(wDates[0])}` : formatMonth(month)}
        </SectionTitle>
        <div className="cal-grid" style={{ marginTop: 12 }}>
          {DOW.map((d) => (
            <div className="cal-dow" key={d}>
              {d}
            </div>
          ))}
          {viewMode === 'week'
            ? wDates.map((date) => (
                <div
                  key={date}
                  className={cellClass(date, weekCounts[date], selected, today)}
                  onClick={() => setSelected(date)}
                >
                  <div className="cn">{Number(date.slice(-2))}</div>
                  {weekCounts[date] ? <div className="cal-b">{weekCounts[date]}</div> : null}
                </div>
              ))
            : monthCells(month).map((date, i) =>
                date === null ? (
                  <div className="cal-c empty" key={`e${i}`} />
                ) : (
                  <div
                    key={date}
                    className={cellClass(date, mCounts[date], selected, today)}
                    onClick={() => setSelected(date)}
                  >
                    <div className="cn">{Number(date.slice(-2))}</div>
                    {mCounts[date] ? <div className="cal-b">{mCounts[date]}</div> : null}
                  </div>
                ),
              )}
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card>
          <DayTable
            date={selected}
            editable={editable}
            filter={filter}
            onAdd={() => setAddOpen(true)}
          />
        </Card>
      </div>

      {addOpen && editable && (
        <AddInterviewModal date={selected} onClose={() => setAddOpen(false)} />
      )}
    </AppShell>
  );
}

function DayTable({
  date,
  editable,
  filter,
  onAdd,
}: {
  date: string;
  editable: boolean;
  filter: InterviewScopeFilter;
  onAdd: () => void;
}) {
  const { data } = useInterviewDay(date, filter);
  const invalidate = [['interview-day', date], ['interviews']];
  const patch = useApiMutation(
    ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/interviews/${id}`, { method: 'PATCH', body }),
    invalidate,
  );
  const remove = useApiMutation(
    ({ id }: { id: string }) => api(`/interviews/${id}`, { method: 'DELETE' }),
    invalidate,
  );

  const rows: InterviewRow[] = [...(data?.mid ?? []), ...(data?.end ?? [])];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <SectionTitle>{formatDate(date)}</SectionTitle>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Mid-day ({data?.mid?.length ?? 0}) · End-day ({data?.end?.length ?? 0})
          </div>
        </div>
        {editable && (
          <Btn small onClick={onAdd}>
            + Add interview
          </Btn>
        )}
      </div>

      {/* Interview list for the selected date — visible to everyone with interviews access. */}
      <div className="tbl-wrap" style={{ marginTop: 14, maxHeight: 420, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Interview</th>
              <th>Candidate</th>
              <th>Time</th>
              <th>Profile</th>
              <th>With</th>
              <th>Sourcing</th>
              <th>Status</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={editable ? 8 : 7} className="muted" style={{ padding: 16 }}>
                  No interviews logged for this day.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{r.ref ?? '—'}</span>
                    {r.round ? <span className="muted"> ({r.round})</span> : null}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.candidate}</div>
                    {r.candidateEmail ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.candidateEmail}
                      </div>
                    ) : null}
                  </td>
                  <td className="muted">{r.time ?? '—'}</td>
                  <td className="muted">{r.profile ?? '—'}</td>
                  <td className="muted">{r.interviewer ?? '—'}</td>
                  <td className="muted">{r.ppgConsultantName ?? '—'}</td>
                  <td>
                    {editable ? (
                      <select
                        className="iv-f"
                        value={r.status ?? 'Scheduled'}
                        onChange={(e) =>
                          patch.mutate({ id: r.id, body: { status: e.target.value } })
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`pill ${statusTone(r.status)}`}>
                        {r.status ?? 'Scheduled'}
                      </span>
                    )}
                  </td>
                  {editable && (
                    <td>
                      <button
                        className="lnk"
                        style={{ color: 'var(--danger, #c0392b)' }}
                        onClick={() => remove.mutate({ id: r.id })}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.byConsultant?.length ? (
        <div style={{ marginTop: 16 }}>
          <SectionTitle color="var(--sky)">Consultant-wise</SectionTitle>
          <div className="legend" style={{ marginTop: 8 }}>
            {data.byConsultant.map((b) => (
              <div className="lg-row" key={b.name}>
                <span className="lg-dot" style={{ background: 'var(--primary)' }} />
                {b.name}
                <span className="lg-v">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {rows.length === 0 && !data && (
        <Empty title="Loading…" icon="▦">
          Fetching interviews for this day.
        </Empty>
      )}
    </div>
  );
}

function AddInterviewModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { me } = useAuth();
  const { data: consultants = [] } = useConsultants();
  const create = useApiMutation(
    (body: Record<string, unknown>) => api('/interviews', { method: 'POST', body }),
    [['interview-day', date], ['interviews']],
  );

  const [ref, setRef] = useState('');
  const [round, setRound] = useState('L1');
  const [candidate, setCandidate] = useState('');
  const [email, setEmail] = useState('');
  const [time, setTime] = useState('');
  const [profile, setProfile] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [session, setSession] = useState<'mid' | 'end'>('mid');
  const [status, setStatus] = useState('Scheduled');
  const [consultantId, setConsultantId] = useState(me?.consultant?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate.trim()) {
      setError('Candidate name is required');
      return;
    }
    setError(null);
    create.mutate(
      {
        date,
        session,
        time: time.trim(),
        candidate: candidate.trim(),
        candidateEmail: email.trim(),
        ref: ref.trim(),
        round,
        profile: profile.trim(),
        interviewer: interviewer.trim(),
        status,
        ppgConsultantId: consultantId || null,
      },
      {
        onSuccess: onClose,
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not add the interview'),
      },
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Add interview"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.5)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 60,
        padding: 20,
      }}
    >
      <div
        className="card pad"
        style={{ width: 640, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle>Add interview — {formatDate(date)}</SectionTitle>
          <button type="button" className="lnk" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={{ marginTop: 14 }}>
          <div className="form-grid">
            <div className="field">
              <label>Interview update</label>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="2026090701"
              />
            </div>
            <div className="field">
              <label>Round</label>
              <select value={round} onChange={(e) => setRound(e.target.value)}>
                {ROUND_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Candidate</label>
              <input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="Name"
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@email.com"
              />
            </div>
            <div className="field">
              <label>Time</label>
              <input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="12:30 PM"
              />
            </div>
            <div className="field">
              <label>Profile</label>
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="Sr. People Consultant"
              />
            </div>
            <div className="field">
              <label>With (interviewer)</label>
              <input
                value={interviewer}
                onChange={(e) => setInterviewer(e.target.value)}
                placeholder="Interviewer name"
              />
            </div>
            <div className="field">
              <label>Sourcing (PPG)</label>
              <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                <option value="">—</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Session</label>
              <select value={session} onChange={(e) => setSession(e.target.value as 'mid' | 'end')}>
                <option value="mid">Mid-day</option>
                <option value="end">End-day</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{ color: 'var(--danger, #c0392b)', fontSize: 13, marginTop: 12 }}
            >
              {error}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-gho" onClick={onClose}>
              Cancel
            </button>
            <Btn type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save interview'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
