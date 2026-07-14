import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import {
  useConsultants,
  useInterviewMonth,
  useInterviewDay,
  useApiMutation,
  type InterviewRow,
} from '../lib/hooks';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROUND_OPTIONS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const STATUS_OPTIONS = ['Scheduled', 'Selected', 'Rejected', 'On Hold'];

function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

export default function InterviewsPage() {
  const { me } = useAuth();
  const editable = can(me, 'interviews', 'edit');
  const [month, setMonth] = useState('2026-06');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: monthData } = useInterviewMonth(month);
  const counts = monthData?.counts ?? {};

  return (
    <AppShell title="Interviews" subtitle="Monthly calendar with per-day logs">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar">
          <div className="field">
            <label htmlFor="iv-month">Month</label>
            <input
              id="iv-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="grid g-58">
        <Card>
          <SectionTitle>{month}</SectionTitle>
          <div className="cal-grid" style={{ marginTop: 12 }}>
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>
                {d}
              </div>
            ))}
            {monthCells(month).map((date, i) =>
              date === null ? (
                <div className="cal-c empty" key={`e${i}`} />
              ) : (
                <div
                  key={date}
                  className={`cal-c ${counts[date] ? 'has' : ''} ${selected === date ? 'sel' : ''}`}
                  onClick={() => setSelected(date)}
                >
                  <div className="cn">{Number(date.slice(-2))}</div>
                  {counts[date] ? <div className="cal-b">{counts[date]}</div> : null}
                </div>
              ),
            )}
          </div>
        </Card>
        <Card>
          {selected ? (
            <DayPanel date={selected} editable={editable} month={month} />
          ) : (
            <Empty title="Select a day" icon="▦">
              Pick a date on the calendar to see mid-day and end-day logs.
            </Empty>
          )}
        </Card>
      </div>
    </AppShell>
  );
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

function DayPanel({ date, editable, month }: { date: string; editable: boolean; month: string }) {
  const { me } = useAuth();
  const { data } = useInterviewDay(date);
  const { data: consultants = [] } = useConsultants();
  const invalidate = [
    ['interview-day', date],
    ['interviews', month],
  ];
  const create = useApiMutation(
    (body: Record<string, unknown>) => api('/interviews', { method: 'POST', body }),
    invalidate,
  );
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

  // "Sourcing" defaults to the logged-in consultant (who is running the interview).
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

  function add() {
    if (!candidate.trim()) return;
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
        onSuccess: () => {
          setCandidate('');
          setEmail('');
          setRef('');
          setProfile('');
          setInterviewer('');
          setTime('');
        },
      },
    );
  }

  return (
    <div>
      <SectionTitle>{date}</SectionTitle>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Mid-day ({data?.mid?.length ?? 0}) · End-day ({data?.end?.length ?? 0})
      </div>

      {/* Daily interview table — visible to everyone with interviews access. */}
      <div className="tbl-wrap" style={{ marginTop: 14 }}>
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

      {editable && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            ADD INTERVIEW
          </div>
          <div className="filterbar" style={{ flexWrap: 'wrap' }}>
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
          <button className="iv-add" onClick={add} disabled={create.isPending}>
            + Add interview
          </button>
        </div>
      )}
    </div>
  );
}
