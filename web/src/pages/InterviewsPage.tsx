import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Empty, Btn } from '../components/ui';
import { SearchableOptionSelect } from '../components/SearchableOptionSelect';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import {
  useConsultants,
  useInterviewMonth,
  useInterviewMonths,
  useInterviewDay,
  useApiMutation,
  useClients,
  useHdisList,
  useKpis,
  useKpiCalendar,
  type InterviewRow,
  type InterviewScopeFilter,
  type DayColor,
} from '../lib/hooks';
import { formatDate, formatMonth } from '../lib/format';
import { parseInterviewText, type ParsedInterviewFields } from '../lib/parseInterviewText';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROUND_OPTIONS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const STATUS_OPTIONS = ['Scheduled', 'Selected', 'Rejected', 'On Hold'];
const TYPE_OPTIONS = ['RAPYD(F)', 'RAPYD(C)', 'Internal'];

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

// Interviews/day KPI target-achievement coloring — overlaid on the month calendar.
const KPI_COLOR_BG: Record<DayColor, string> = {
  green: 'rgba(34,197,94,.22)',
  amber: 'rgba(234,179,8,.24)',
  red: 'rgba(239,68,68,.20)',
  none: 'transparent',
};
const KPI_COLOR_BORDER: Record<DayColor, string> = {
  green: 'rgba(34,197,94,.6)',
  amber: 'rgba(234,179,8,.65)',
  red: 'rgba(239,68,68,.55)',
  none: 'transparent',
};
function kpiCellStyle(color: DayColor | undefined) {
  if (!color || color === 'none') return undefined;
  return { background: KPI_COLOR_BG[color], border: `2px solid ${KPI_COLOR_BORDER[color]}` };
}

function Legend({ color, label }: { color: DayColor; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: KPI_COLOR_BG[color],
          border: `1.5px solid ${color === 'none' ? 'var(--border, #e5e7eb)' : KPI_COLOR_BORDER[color]}`,
          display: 'inline-block',
        }}
      />
      <span className="muted">{label}</span>
    </div>
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
  const [editing, setEditing] = useState<InterviewRow | null>(null);

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

  // Interviews/day KPI target-achievement overlay — only fetched for users who can
  // see the KPI section (currently super_admin), and only when a KPI is wired to
  // 'interviews_per_day'. Silently absent for everyone else; the calendar still
  // works exactly as before without it.
  const canTrackKpi = can(me, 'kpis', 'view');
  const { data: kpis = [] } = useKpis({ enabled: canTrackKpi });
  const trackedKpi = kpis.find((k) => k.trackedMetric === 'interviews_per_day') ?? null;
  const { data: kpiCal } = useKpiCalendar(
    canTrackKpi ? (trackedKpi?.id ?? null) : null,
    month,
    me?.scope === 'org' && teamFilter ? teamFilter : undefined,
  );
  const colorByDate = useMemo(() => {
    const map: Record<string, DayColor> = {};
    for (const d of kpiCal?.days ?? []) map[d.date] = d.color;
    return map;
  }, [kpiCal]);

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
                    style={kpiCellStyle(colorByDate[date])}
                    onClick={() => setSelected(date)}
                  >
                    <div className="cn">{Number(date.slice(-2))}</div>
                    {mCounts[date] ? <div className="cal-b">{mCounts[date]}</div> : null}
                  </div>
                ),
              )}
        </div>

        {viewMode === 'month' && canTrackKpi && trackedKpi && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 14,
              flexWrap: 'wrap',
              fontSize: 12,
              alignItems: 'center',
            }}
          >
            <span className="muted">
              {trackedKpi.symbol} {trackedKpi.title} ({trackedKpi.target}
              {kpiCal ? ` · team target ${kpiCal.totalTarget}/day` : ''}):
            </span>
            <Legend color="green" label="At/above target" />
            <Legend color="amber" label="80%+ of target" />
            <Legend color="red" label="Below 80%" />
            <Legend color="none" label="No data" />
          </div>
        )}
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card>
          <DayTable
            date={selected}
            editable={editable}
            filter={filter}
            onAdd={() => setAddOpen(true)}
            onEdit={setEditing}
          />
        </Card>
      </div>

      {addOpen && editable && (
        <InterviewFormModal mode="create" date={selected} onClose={() => setAddOpen(false)} />
      )}
      {editing && editable && (
        <InterviewFormModal
          mode="edit"
          date={editing.date}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </AppShell>
  );
}

function DayTable({
  date,
  editable,
  filter,
  onAdd,
  onEdit,
}: {
  date: string;
  editable: boolean;
  filter: InterviewScopeFilter;
  onAdd: () => void;
  onEdit: (row: InterviewRow) => void;
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
              <th>Client</th>
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
                <td colSpan={editable ? 9 : 8} className="muted" style={{ padding: 16 }}>
                  No interviews logged for this day.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{r.ref ?? '—'}</span>
                    {r.round ? <span className="muted"> ({r.round})</span> : null}
                    {r.type ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.type}
                      </div>
                    ) : null}
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
                  <td className="muted">{r.client ?? '—'}</td>
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
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="lnk" onClick={() => onEdit(r)}>
                          Edit
                        </button>
                        <button
                          className="lnk"
                          style={{ color: 'var(--danger, #c0392b)' }}
                          onClick={() => remove.mutate({ id: r.id })}
                        >
                          Remove
                        </button>
                      </div>
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

// ---- "Paste to fill" matching helpers ----
// The parser hands back raw label text; these turn that into the app's actual
// option values (round codes, dropdown ids, etc.) by loose case/substring
// matching against whatever's currently loaded, rather than a strict lookup.
function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = normText(raw);
  return STATUS_OPTIONS.find((o) => normText(o) === n || n.includes(normText(o)));
}

/** "Face 2 Face" → RAPYD(F), "Virtual/phone/call" → RAPYD(C), else Internal
 *  if said explicitly. No confident guess → undefined (left for the user). */
function matchType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = raw.toLowerCase();
  if (TYPE_OPTIONS.some((o) => normText(o) === normText(raw))) {
    return TYPE_OPTIONS.find((o) => normText(o) === normText(raw));
  }
  if (n.includes('internal')) return 'Internal';
  if (n.includes('face')) return 'RAPYD(F)';
  if (n.includes('call') || n.includes('phone') || n.includes('virtual') || n.includes('video')) {
    return 'RAPYD(C)';
  }
  return undefined;
}

/** Best-effort match of a free-text name against {id, label} choices — exact
 *  (case/space-insensitive) match first, then "label contains the raw text". */
function matchByLabel<T extends { label: string }>(
  raw: string | undefined,
  choices: T[],
): T | undefined {
  if (!raw) return undefined;
  const n = normText(raw);
  return (
    choices.find((c) => normText(c.label) === n) ??
    choices.find((c) => normText(c.label).includes(n))
  );
}

function InterviewFormModal({
  mode,
  date,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit';
  date: string;
  initial?: InterviewRow;
  onClose: () => void;
}) {
  const { me } = useAuth();
  const { data: consultants = [] } = useConsultants();
  const { data: clients = [] } = useClients();
  // Already RBAC-scoped server-side — team/own-scope users only get back the HDIS
  // records assigned to them, org-scope users get everything.
  const { data: hdisOptions = [] } = useHdisList({});
  const hdisChoices = useMemo(
    () => hdisOptions.map((h) => ({ id: h.jdId, label: `${h.title} — ${h.client} (${h.jdId})` })),
    [hdisOptions],
  );
  const defaultConsultantId = mode === 'create' ? (me?.consultant?.id ?? '') : '';
  const [ref, setRef] = useState(initial?.ref ?? '');
  const [round, setRound] = useState(initial?.round ?? 'L1');
  const [type, setType] = useState(initial?.type ?? '');
  const [candidate, setCandidate] = useState(initial?.candidate ?? '');
  const [email, setEmail] = useState(initial?.candidateEmail ?? '');
  const [time, setTime] = useState(initial?.time ?? '');
  const [client, setClient] = useState(initial?.client ?? '');
  const [hdisJdId, setHdisJdId] = useState(initial?.requirementRef ?? '');
  const [interviewer, setInterviewer] = useState(initial?.interviewer ?? '');
  const [session, setSession] = useState<'mid' | 'end'>(initial?.session ?? 'mid');
  const [status, setStatus] = useState(initial?.status ?? 'Scheduled');
  const [consultantId, setConsultantId] = useState(initial?.ppgConsultantId ?? defaultConsultantId);
  const [error, setError] = useState<string | null>(null);

  // Normally fixed to the calendar day that was clicked to open the modal, but
  // "Paste to fill" can carry its own date — kept as separate state (rather
  // than always trusting the `date` prop) so a pasted date actually targets
  // the right day instead of silently being ignored.
  const [dateOverride, setDateOverride] = useState(date);

  const invalidate = [['interview-day', date], ['interview-day', dateOverride], ['interviews']];
  const create = useApiMutation(
    (body: Record<string, unknown>) => api('/interviews', { method: 'POST', body }),
    invalidate,
  );
  const update = useApiMutation(
    (body: Record<string, unknown>) => api(`/interviews/${initial?.id}`, { method: 'PATCH', body }),
    invalidate,
  );
  const mutation = mode === 'edit' ? update : create;

  // ---- Paste to fill ----
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteNotes, setPasteNotes] = useState<string[]>([]);

  function applyParsed(fields: ParsedInterviewFields, unmatchedLines: string[]) {
    const filled: string[] = [];
    const missed: string[] = [];

    if (fields.ref) {
      setRef(fields.ref);
      filled.push('Interview update');
    }
    if (fields.round) {
      setRound(fields.round);
      filled.push('Round');
    }
    const typeMatch = matchType(fields.modeRaw);
    if (typeMatch) {
      setType(typeMatch);
      filled.push('Type');
    } else if (fields.modeRaw) {
      missed.push(`Type/Mode — couldn't match "${fields.modeRaw}", pick one manually`);
    }
    if (fields.candidate) {
      setCandidate(fields.candidate);
      filled.push('Candidate');
    }
    if (fields.email) {
      setEmail(fields.email);
      filled.push('Email');
    }
    if (fields.dateISO) {
      setDateOverride(fields.dateISO);
      filled.push('Date');
    }
    if (fields.time) {
      setTime(fields.time);
      filled.push('Time');
    }
    if (fields.profileRaw) {
      const match = matchByLabel(fields.profileRaw, hdisChoices);
      if (match) {
        selectHdis(match.id);
        filled.push('Profile');
      } else {
        missed.push(`Profile — couldn't match "${fields.profileRaw}" to an HDIS requirement`);
      }
    }
    // "With: <client>" — matched against the client master list. Comes after
    // the Profile match above so an explicit Client line always wins over
    // whatever client selectHdis() may have inferred from the matched
    // requirement.
    if (fields.client) {
      const match = matchByLabel(
        fields.client,
        clients.map((c) => ({ id: c.id, label: c.name })),
      );
      if (match) {
        setClient(match.label);
        filled.push('Client');
      } else {
        missed.push(`Client — couldn't match "${fields.client}" to a known client`);
      }
    }
    // Interviewer is optional — only set it when the paste actually has an
    // "Interviewer:" line; nothing here implies or requires one.
    if (fields.interviewer) {
      setInterviewer(fields.interviewer);
      filled.push('Interviewer');
    }
    if (fields.sourcingRaw) {
      const match = matchByLabel(
        fields.sourcingRaw,
        consultants.map((c) => ({ id: c.id, label: c.name })),
      );
      if (match) {
        setConsultantId(match.id);
        filled.push('Sourcing (PPG)');
      } else {
        missed.push(`Sourcing — couldn't match "${fields.sourcingRaw}" to a PPG consultant`);
      }
    }
    if (fields.statusRaw) {
      const match = matchStatus(fields.statusRaw);
      if (match) {
        setStatus(match);
        filled.push('Status');
      } else {
        missed.push(`Status — couldn't match "${fields.statusRaw}"`);
      }
    }

    const notes: string[] = [];
    if (filled.length) notes.push(`Filled: ${filled.join(', ')}.`);
    if (missed.length) notes.push(...missed);
    if (unmatchedLines.length) {
      notes.push(`Not recognized: ${unmatchedLines.map((l) => `"${l}"`).join(', ')}.`);
    }
    if (!filled.length && !missed.length && !unmatchedLines.length) {
      notes.push('Nothing recognizable in that text — check the format and try again.');
    }
    setPasteNotes(notes);
  }

  function handleParse() {
    const { fields, unmatchedLines } = parseInterviewText(pasteText);
    applyParsed(fields, unmatchedLines);
  }

  function selectHdis(jdId: string) {
    setHdisJdId(jdId);
    // Pre-fill the client from the chosen requirement — still editable afterward.
    const picked = hdisOptions.find((h) => h.jdId === jdId);
    if (picked) setClient(picked.client);
  }

  // Any field that differs from its starting point means there's something to lose
  // on close — "starting point" is the initial record's values in edit mode, or the
  // blank defaults in create mode.
  const isDirty =
    dateOverride !== date ||
    ref.trim() !== (initial?.ref ?? '') ||
    round !== (initial?.round ?? 'L1') ||
    type !== (initial?.type ?? '') ||
    candidate.trim() !== (initial?.candidate ?? '') ||
    email.trim() !== (initial?.candidateEmail ?? '') ||
    time.trim() !== (initial?.time ?? '') ||
    client !== (initial?.client ?? '') ||
    hdisJdId !== (initial?.requirementRef ?? '') ||
    interviewer.trim() !== (initial?.interviewer ?? '') ||
    session !== (initial?.session ?? 'mid') ||
    status !== (initial?.status ?? 'Scheduled') ||
    consultantId !== (initial?.ppgConsultantId ?? defaultConsultantId);

  // Kept fresh each render so the popstate handler (registered once) always sees
  // the current dirty state without needing to be re-subscribed.
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Guards backdrop click / X / Cancel: only these call requestClose(), which
  // confirms before discarding if the form has unsaved data.
  const closingRef = useRef(false);
  function requestClose() {
    if (dirtyRef.current && !window.confirm('Discard the interview details you entered?')) return;
    closingRef.current = true;
    onClose();
  }

  // Browser back button: push a history entry on mount so back triggers popstate
  // instead of leaving the page; confirm-and-close on genuine back presses, but
  // don't re-confirm when we ourselves call history.back() from requestClose().
  useEffect(() => {
    window.history.pushState({ interviewModal: true }, '');
    function onPopState() {
      if (closingRef.current) return;
      if (dirtyRef.current && !window.confirm('Discard the interview details you entered?')) {
        window.history.pushState({ interviewModal: true }, '');
        return;
      }
      closingRef.current = true;
      onClose();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (closingRef.current) window.history.back();
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate.trim()) {
      setError('Candidate name is required');
      return;
    }
    setError(null);
    const selectedHdis = hdisOptions.find((h) => h.jdId === hdisJdId);
    const body = {
      date: dateOverride,
      session,
      time: time.trim(),
      type: type || undefined,
      candidate: candidate.trim(),
      candidateEmail: email.trim(),
      ref: ref.trim(),
      round,
      client: client || undefined,
      profile: selectedHdis?.title ?? (mode === 'edit' ? (initial?.profile ?? '') : ''),
      requirementRef: hdisJdId || undefined,
      interviewer: interviewer.trim(),
      status,
      ppgConsultantId: consultantId || null,
    };
    mutation.mutate(body, {
      onSuccess: () => {
        closingRef.current = true;
        onClose();
      },
      onError: (err) =>
        setError(
          err instanceof Error
            ? err.message
            : `Could not ${mode === 'edit' ? 'save' : 'add'} the interview`,
        ),
    });
  }

  return (
    <div
      role="dialog"
      aria-label={mode === 'edit' ? 'Edit interview' : 'Add interview'}
      onClick={requestClose}
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
          <SectionTitle>
            {mode === 'edit' ? 'Edit interview' : 'Add interview'} — {formatDate(dateOverride)}
          </SectionTitle>
          <button type="button" className="lnk" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="lnk"
            onClick={() => setPasteOpen((v) => !v)}
            aria-expanded={pasteOpen}
          >
            {pasteOpen ? '− Hide paste to fill' : '+ Paste interview details to fill this form'}
          </button>
          {pasteOpen && (
            <div style={{ marginTop: 8 }}>
              <textarea
                aria-label="Paste interview details"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  'Interview Update: 2026140808(L4)\nMode - Face 2 Face\nCandidate Full Name: Tanya Garg\nEmail: tgarg1012@gmail.com\nDate: Aug 14, 2026\nTime: 3:30 PM\nProfile: Flutter VIP\nWith: Vianaar Homes\nInterviewer: Kushagra Bindra\nSourcing: Priya Pal\nStatus: Selected'
                }
                rows={6}
                style={{ width: '100%', fontFamily: 'inherit', fontSize: 13 }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-gho"
                  onClick={handleParse}
                  disabled={!pasteText.trim()}
                >
                  Parse &amp; fill
                </button>
                {pasteNotes.length > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Review the fields below before saving.
                  </span>
                )}
              </div>
              {pasteNotes.length > 0 && (
                <ul style={{ marginTop: 8, fontSize: 12, paddingLeft: 18 }}>
                  {pasteNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
              <label htmlFor="iv-date">Date</label>
              <input
                id="iv-date"
                type="date"
                value={dateOverride}
                onChange={(e) => setDateOverride(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">—</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="iv-client">Client</label>
              <select id="iv-client" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
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
              <label htmlFor="iv-profile">Profile</label>
              <SearchableOptionSelect
                id="iv-profile"
                value={hdisJdId}
                onChange={selectHdis}
                options={hdisChoices}
                placeholder="Search by title, client, or JD ID…"
                fallbackLabel={mode === 'edit' ? (initial?.profile ?? undefined) : undefined}
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
            <button type="button" className="btn btn-gho" onClick={requestClose}>
              Cancel
            </button>
            <Btn type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save interview'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
