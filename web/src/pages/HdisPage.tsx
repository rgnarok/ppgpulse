import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Pill, Empty, Btn, SplitStatCard } from '../components/ui';
import { SearchableSelect } from '../components/SearchableSelect';
import { MultiSelect } from '../components/MultiSelect';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api, apiUrl } from '../lib/api';
import {
  useHdisList,
  useHdisRecord,
  useHdisActivity,
  useClients,
  useConsultants,
  useApiMutation,
  useSetHdisLink,
  useSaveRequirementDetail,
  useCandidates,
  useCreateCandidate,
  useUpdateCandidate,
  useDeleteCandidate,
} from '../lib/hooks';
import { formatDate, formatMonth, formatDateTime, todayISO } from '../lib/format';
import { fyOfMonth, fyLabel, fyMonths, fiscalYearsFor, currentFy, currentMonth } from '../lib/fy';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import type { Candidate, HdisRecord, RequirementDetail } from '../lib/types';

const TYPE_OPTIONS = ['RADC', 'RADF', 'Internal'];
const STATUS_OPTIONS = ['Pending', 'Active', 'On Hold', 'Fulfilled', 'Closed'];
/** A record is "live" for tile-counting purposes (RAPYD Active, Total Live
 * Requirements, Priority tiles, etc. — see isLiveHdisStatus/isLiveStatus server-side)
 * once it hasn't reached Fulfilled or Closed — that includes both Active AND On Hold.
 * The list's status filter is otherwise a literal equality match, so a synthetic
 * 'live' sentinel value lets tile click-throughs land on a filtered list whose count
 * actually matches the tile's number, instead of narrowing to literal status=Active
 * and silently dropping On Hold records. */
const LIVE_STATUS_FILTER = 'live';
function isLiveStatusValue(status: string): boolean {
  return status !== 'Fulfilled' && status !== 'Closed' && status !== 'Pending';
}
/** P1/P2/P3 = live priority tiers shown on the Dhruva dashboard; "NA" (displayed as
 * "Uncategorised") is the default for records nobody has triaged yet. */
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'NA'];
function priorityLabel(p: string): string {
  return p === 'NA' ? 'Uncategorised' : p;
}
/** Status-specific reasons — only meaningful (and only shown) while the record is
 * "On Hold", "Fulfilled", or "Closed"; cleared automatically when the status moves back to Active. */
const STATUS_REASON_OPTIONS: Record<string, string[]> = {
  'On Hold': ['Hold By client', 'Hold By VAYUZ'],
  Fulfilled: ['Fulfilled by VAYUZ', 'Fulfilled by others'],
  Closed: ['Closed by VAYUZ', 'Closed by others'],
};

function distinctSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

/** Total count plus a RADC/RADF/Internal split — powers the two headline stat cards.
 * Includes Internal so the three numbers always reconcile with the total (radc + radf
 * + internal === total), matching Dhruva's Total Live Requirements tile. */
function typeBreakdown(records: HdisRecord[]) {
  return {
    total: records.length,
    radc: records.filter((r) => r.type === 'RADC').length,
    radf: records.filter((r) => r.type === 'RADF').length,
    internal: records.filter((r) => r.type === 'Internal').length,
  };
}

export default function HdisPage() {
  const { jdId } = useParams();
  if (jdId) return <HdisDetail jdId={jdId} />;
  return <HdisList />;
}

interface HdisFilters {
  fy: string;
  month: string;
  client: string;
  owner: string;
  type: string;
  priority: string;
  status: string;
  q: string;
}
const EMPTY_FILTERS: HdisFilters = {
  fy: '',
  month: '',
  client: '',
  owner: '',
  type: '',
  priority: '',
  status: '',
  q: '',
};

/** Read the initial filter state from the URL so a round trip into a record and
 * back (or a shared link) restores whatever was applied. */
function filtersFromParams(params: URLSearchParams): HdisFilters {
  return {
    fy: params.get('fy') ?? '',
    month: params.get('month') ?? '',
    client: params.get('client') ?? '',
    owner: params.get('owner') ?? '',
    type: params.get('type') ?? '',
    priority: params.get('priority') ?? '',
    status: params.get('status') ?? '',
    q: params.get('q') ?? '',
  };
}

/** Fresh visits (no filters in the URL yet) default to the current fiscal year +
 * current month, rather than opening on the whole all-time list — matches Dhruva's
 * and Home's "defaults to now" convention. Anyone can hit Reset to see everything;
 * an explicit URL (including a link with filters deliberately cleared) is always
 * honored as-is instead of being overridden. */
function defaultHdisFilters(): HdisFilters {
  return { ...EMPTY_FILTERS, fy: currentFy(), month: currentMonth() };
}

function HdisList() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filters, setFiltersState] = useState<HdisFilters>(() =>
    params.toString() ? filtersFromParams(params) : defaultHdisFilters(),
  );
  const [page, setPageState] = useState(() => Number(params.get('page')) || 1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HdisRecord | null>(null);
  // Right after a record is created it has no questionnaire yet, so the create flow
  // always follows up with it — see HdisFormModal's onCreated prop.
  const [detailsFor, setDetailsFor] = useState<HdisRecord | null>(null);
  // Filtering happens client-side across the full set — the dataset is small enough
  // (dozens to low hundreds of records) that this is instant and keeps every filter
  // (month/client/owner/type/status/search) trivially composable without round-trips.
  const { data: rows = [], isLoading } = useHdisList({});
  const canAdd = can(me, 'hdis', 'add');
  // Blanket edit (org-scope roles, or anyone granted "Full HDIS access") can edit any
  // record; everyone else can only edit the records they're personally listed as an
  // owner of — mirrors the server-side check in assertCanEditHdisRecord.
  const canEditAll = can(me, 'hdis', 'edit');
  const isOwnerOf = (r: HdisRecord) => !!me?.name && r.owners.includes(me.name);
  const rowEditable = (r: HdisRecord) => canEditAll || isOwnerOf(r);

  const dataMonths = useMemo(() => distinctSorted(rows.map((r) => r.reqDate.slice(0, 7))), [rows]);
  // Always offer the current fiscal year/month as pickable options even if no HDIS
  // record has landed there yet — the list defaults to them on a fresh visit (see
  // defaultHdisFilters above), and a data-only option list would otherwise render the
  // select blank the moment a brand-new period has zero records so far.
  const fys = useMemo(
    () => distinctSorted([...fiscalYearsFor(dataMonths), currentFy()]).reverse(),
    [dataMonths],
  );
  // Month options are the fiscal year's Apr–Mar span, narrowed to months that actually
  // have records — matches the "Jun 2026" style used everywhere else on the platform.
  const monthsInFy = useMemo(() => {
    if (!filters.fy) return [];
    const dataSet = new Set(dataMonths);
    if (filters.fy === currentFy()) dataSet.add(currentMonth());
    return fyMonths(filters.fy).filter((m) => dataSet.has(m));
  }, [filters.fy, dataMonths]);
  const clients = useMemo(() => distinctSorted(rows.map((r) => r.client)), [rows]);
  const owners = useMemo(() => distinctSorted(rows.flatMap((r) => r.owners)), [rows]);

  // Headline stat cards — always reflect the full dataset, not the active filters.
  const today = useMemo(() => todayISO(), []);
  const totalStats = useMemo(() => typeBreakdown(rows), [rows]);
  const todayStats = useMemo(
    () => typeBreakdown(rows.filter((r) => r.reqDate === today)),
    [rows, today],
  );

  /** Writes filters + page to both state and the URL in one go — every filter change
   * resets to page 1 (a stale page number past the new, smaller result set would
   * otherwise look like an empty list). */
  function persist(nextFilters: HdisFilters, nextPage: number) {
    setFiltersState(nextFilters);
    setPageState(nextPage);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(nextFilters)) if (v) p.set(k, v);
    if (nextPage > 1) p.set('page', String(nextPage));
    setParams(p, { replace: true });
  }

  const setFilters = (next: HdisFilters) => persist(next, 1);
  const set = (patch: Partial<HdisFilters>) => setFilters({ ...filters, ...patch });
  const setPage = (next: number) => persist(filters, next);

  function setFy(fy: string) {
    // Changing (or clearing) the fiscal year invalidates any month picked from a
    // different FY, so reset it rather than leaving a stale, hidden selection applied.
    setFilters({ ...filters, fy, month: '' });
  }

  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      const month = r.reqDate.slice(0, 7);
      if (filters.fy && fyOfMonth(month) !== filters.fy) return false;
      if (filters.month && month !== filters.month) return false;
      if (filters.client && r.client !== filters.client) return false;
      if (filters.owner && !r.owners.includes(filters.owner)) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.priority && r.priority !== filters.priority) return false;
      if (filters.status === LIVE_STATUS_FILTER) {
        if (!isLiveStatusValue(r.status)) return false;
      } else if (filters.status && r.status !== filters.status) return false;
      if (needle) {
        const hay = `${r.title} ${r.client} ${r.jdId}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * DEFAULT_PAGE_SIZE, currentPage * DEFAULT_PAGE_SIZE),
    [filtered, currentPage],
  );

  const hasFilters = Object.values(filters).some(Boolean);
  // Based on the full filtered set (not just the current page) so the column doesn't
  // appear/disappear as you page through results.
  const showEditColumn = canEditAll || filtered.some(isOwnerOf);

  return (
    <AppShell title="HDIS" subtitle="Hiring Display Information System — requirement master">
      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <SplitStatCard
          icon="▦"
          label="Total Requirements"
          value={totalStats.total}
          sub="all HDIS records"
          splits={[
            { value: totalStats.radc, label: 'RADC', color: 'var(--violet)' },
            { value: totalStats.radf, label: 'RADF', color: 'var(--sky)' },
            { value: totalStats.internal, label: 'Internal', color: 'var(--gold)' },
          ]}
        />
        <SplitStatCard
          icon="◔"
          label="Today's Requirement"
          value={todayStats.total}
          sub={formatDate(today)}
          splits={[
            { value: todayStats.radc, label: 'RADC', color: 'var(--violet)' },
            { value: todayStats.radf, label: 'RADF', color: 'var(--sky)' },
            { value: todayStats.internal, label: 'Internal', color: 'var(--gold)' },
          ]}
        />
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar-actions">
          <button
            type="button"
            className="btn btn-gho"
            disabled={!hasFilters}
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Reset
          </button>
          {canAdd && <Btn onClick={() => setShowAdd(true)}>+ Add record</Btn>}
        </div>
        <div className="filterbar filterbar-compact">
          <div className="field">
            <label htmlFor="hdis-fy">Fiscal year</label>
            <select id="hdis-fy" value={filters.fy} onChange={(e) => setFy(e.target.value)}>
              <option value="">All years</option>
              {fys.map((fy) => (
                <option key={fy} value={fy}>
                  {fyLabel(fy)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-month">Month</label>
            <select
              id="hdis-month"
              value={filters.month}
              onChange={(e) => set({ month: e.target.value })}
              disabled={!filters.fy}
            >
              <option value="">
                {filters.fy ? `All of ${fyLabel(filters.fy)}` : 'Pick a fiscal year first'}
              </option>
              {monthsInFy.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-client">Client</label>
            <select
              id="hdis-client"
              value={filters.client}
              onChange={(e) => set({ client: e.target.value })}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-owner">Team member</label>
            <select
              id="hdis-owner"
              value={filters.owner}
              onChange={(e) => set({ owner: e.target.value })}
            >
              <option value="">All owners</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-type">Type</label>
            <select
              id="hdis-type"
              value={filters.type}
              onChange={(e) => set({ type: e.target.value })}
            >
              <option value="">All types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-priority">Priority</label>
            <select
              id="hdis-priority"
              value={filters.priority}
              onChange={(e) => set({ priority: e.target.value })}
            >
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hdis-status">Status</label>
            <select
              id="hdis-status"
              value={filters.status}
              onChange={(e) => set({ status: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value={LIVE_STATUS_FILTER}>Active + On Hold (live)</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 200, maxWidth: 240 }}>
            <label htmlFor="hdis-search">Search</label>
            <input
              id="hdis-search"
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Title, client, or JD ID"
            />
          </div>
        </div>
        {!isLoading && (
          <div className="showing" style={{ marginTop: 10 }}>
            Showing {filtered.length} of {rows.length} record{rows.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <Empty title="No HDIS records match these filters" icon="▤" />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl hover">
              <thead>
                <tr>
                  <th>JD ID</th>
                  <th>Req. date</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Owners</th>
                  {showEditColumn && <th />}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr
                    key={r.jdId}
                    onClick={() =>
                      navigate(`/hdis/${r.jdId}`, {
                        state: {
                          backTo: `/hdis${params.toString() ? `?${params.toString()}` : ''}`,
                        },
                      })
                    }
                  >
                    <td className="mono">{r.jdId}</td>
                    <td className="muted">{formatDate(r.reqDate)}</td>
                    <td>{r.title}</td>
                    <td>{r.client}</td>
                    <td>
                      <Pill>{r.type}</Pill>
                    </td>
                    <td>
                      <Pill tone={r.priority === 'NA' ? 'p-grey' : 'p-amber'}>
                        {priorityLabel(r.priority)}
                      </Pill>
                    </td>
                    <td>
                      <Pill>{r.status}</Pill>
                    </td>
                    <td className="muted">{r.owners.join(', ')}</td>
                    {showEditColumn && (
                      <td>
                        {rowEditable(r) && (
                          <button
                            type="button"
                            className="lnk"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(r);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={filtered.length}
          onChange={setPage}
        />
      </Card>

      {showAdd && (
        <HdisFormModal
          mode="create"
          onClose={() => setShowAdd(false)}
          onCreated={(created) => setDetailsFor(created)}
        />
      )}
      {editing && <HdisFormModal mode="edit" initial={editing} onClose={() => setEditing(null)} />}
      {detailsFor && (
        <RequirementDetailModal record={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </AppShell>
  );
}

function HdisFormModal({
  mode,
  initial,
  onClose,
  onCreated,
}: {
  mode: 'create' | 'edit';
  initial?: HdisRecord;
  onClose: () => void;
  /** Create mode only: called with the newly created record right after a successful
   * save, so the caller can immediately follow up with the requirement questionnaire
   * — a fresh record can't be Active yet, so there's always a next step. */
  onCreated?: (record: HdisRecord) => void;
}) {
  const { me } = useAuth();
  const { data: clientRows = [] } = useClients();
  const clientNames = useMemo(() => clientRows.map((c) => c.name), [clientRows]);
  const { data: consultants = [] } = useConsultants();
  const ppgNames = useMemo(() => distinctSorted(consultants.map((c) => c.name)), [consultants]);

  const create = useApiMutation(
    (body: Record<string, unknown>) => api<HdisRecord>('/hdis', { method: 'POST', body }),
    [['hdis', {}], ['clients']],
  );
  const update = useApiMutation(
    (body: Record<string, unknown>) =>
      api<HdisRecord>(`/hdis/${initial?.jdId}`, { method: 'PATCH', body }),
    [['hdis', {}], ['hdis-record', initial?.jdId], ['hdis-activity', initial?.jdId], ['clients']],
  );
  const mutation = mode === 'edit' ? update : create;

  const [form, setForm] = useState(() => ({
    jdId: initial?.jdId ?? '',
    title: initial?.title ?? '',
    client: initial?.client ?? '',
    type: initial?.type ?? 'RADC',
    priority: initial?.priority ?? 'NA',
    status: initial?.status ?? 'Active',
    statusReason: initial?.statusReason ?? '',
    remarks: initial?.remarks ?? '',
    reqDate: initial?.reqDate ?? '2026-06-01',
    jdLink: initial?.jdLink ?? '',
    // How many openings this JD covers — shown as "Positions" everywhere in the UI.
    // Kept as a string like the rest of the form fields; converted back to a number
    // (defaulting to 1 for anything blank/invalid) on submit.
    openings: String(initial?.openings ?? 1),
  }));
  // Consultants adding a record for their own JD start out as its owner (still
  // removable/extendable). Org-scope roles routinely add records on behalf of the
  // team, so they still get a blank picker, same as before.
  const [owners, setOwners] = useState<string[]>(
    initial?.owners ?? (mode === 'create' && me?.scope !== 'org' && me?.name ? [me.name] : []),
  );
  const reasonOptions = STATUS_REASON_OPTIONS[form.status] ?? [];
  const set = (k: string, v: string) =>
    setForm((f) => ({
      ...f,
      [k]: v,
      // Status reasons only apply to On Hold / Closed — drop a stale one when the
      // status moves away from whichever it belonged to.
      ...(k === 'status' && !(STATUS_REASON_OPTIONS[v] ?? []).includes(f.statusReason)
        ? { statusReason: '' }
        : {}),
    }));

  function submit() {
    const openings = Number(form.openings) || 1;
    if (mode === 'edit') {
      update.mutate(
        {
          title: form.title,
          client: form.client,
          type: form.type,
          priority: form.priority,
          status: form.status,
          statusReason: form.statusReason || null,
          remarks: form.remarks.trim() || null,
          reqDate: form.reqDate,
          jdLink: form.jdLink || null,
          openings,
          owners,
        },
        { onSuccess: onClose },
      );
      return;
    }
    // Status isn't settable at creation — every new record is born "Pending" on the
    // server regardless (see createHdisSchema/createHdis) — so status/statusReason
    // are deliberately left out of the create payload.
    const { status: _status, statusReason: _statusReason, ...createFields } = form;
    void _status;
    void _statusReason;
    create.mutate(
      {
        ...createFields,
        remarks: form.remarks.trim() || null,
        jdLink: form.jdLink || null,
        openings,
        owners,
      },
      {
        onSuccess: (created) => {
          onClose();
          onCreated?.(created);
        },
      },
    );
  }

  return (
    <div role="dialog" onClick={onClose} style={overlay}>
      <div
        className="card pad"
        style={{ width: 620, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>{mode === 'edit' ? `Edit ${initial?.jdId}` : 'New HDIS record'}</SectionTitle>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>JD ID</label>
            <input
              value={form.jdId}
              onChange={(e) => set('jdId', e.target.value)}
              placeholder="VAY_XX_20260601"
              readOnly={mode === 'edit'}
              disabled={mode === 'edit'}
            />
          </div>
          <div className="field">
            <label>Requirement date</label>
            <input
              type="date"
              value={form.reqDate}
              onChange={(e) => set('reqDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="hdis-form-openings">Positions</label>
            <input
              id="hdis-form-openings"
              type="number"
              min={1}
              value={form.openings}
              onChange={(e) => set('openings', e.target.value)}
            />
          </div>
          <div className="field full">
            <label>Title</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hdis-form-client">Client</label>
            <SearchableSelect
              id="hdis-form-client"
              value={form.client}
              onChange={(v) => set('client', v)}
              options={clientNames}
              placeholder="Start typing a client name…"
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          {mode === 'edit' && (
            <div className="field">
              <label htmlFor="hdis-form-status">Status</label>
              <select
                id="hdis-form-status"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option
                    key={s}
                    value={s}
                    disabled={
                      s === 'Active' && !initial?.detailsComplete && initial?.status !== 'Active'
                    }
                  >
                    {s}
                  </option>
                ))}
              </select>
              {!initial?.detailsComplete && initial?.status !== 'Active' && (
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Complete the requirement questionnaire to unlock Active.
                </p>
              )}
            </div>
          )}
          <div className="field">
            <label htmlFor="hdis-form-priority">Priority</label>
            <select
              id="hdis-form-priority"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
          {reasonOptions.length > 0 && (
            <div className="field">
              <label>Status reason</label>
              <select
                value={form.statusReason}
                onChange={(e) => set('statusReason', e.target.value)}
              >
                <option value="">Select a reason…</option>
                {reasonOptions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>JD link</label>
            <input
              value={form.jdLink}
              onChange={(e) => set('jdLink', e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="field full">
            <label htmlFor="hdis-form-ppg">PPG</label>
            <MultiSelect
              id="hdis-form-ppg"
              values={owners}
              onChange={setOwners}
              options={ppgNames}
              placeholder="Add PPG team member…"
            />
          </div>
          <div className="field full">
            <label>Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder="Optional context for this record — shown on the detail page"
              rows={3}
            />
          </div>
        </div>
        {mutation.isError && (
          <div className="pill p-red" style={{ marginTop: 12, display: 'block' }}>
            {mode === 'edit'
              ? 'Could not save the changes.'
              : 'Could not save — check the JD ID is unique.'}
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="gho" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit} disabled={mutation.isPending}>
            {mode === 'edit' ? 'Save changes' : 'Save record'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

type DetailFieldType = 'text' | 'textarea' | 'number' | 'radio' | 'yesno';

interface DetailFieldConfig {
  key: keyof RequirementDetail;
  label: string;
  required: boolean;
  type: DetailFieldType;
  options?: string[];
}

interface DetailSectionConfig {
  title: string;
  fields: DetailFieldConfig[];
}

/** The "BIG RAPYD Requirement Questionnaire", grouped into sections. Two questions
 * from the original questionnaire are deliberately omitted here — "Client/Prospect
 * Name" and "Total Number of Openings" already exist as the record's own Client and
 * Positions fields, so asking again would just be a duplicate. The "Screenshot
 * Attachment" question is satisfied by the record's existing Attachments card rather
 * than a second upload control — see the note under the Commercial & closure section.
 * This list's `required` flags must stay in sync with REQUIRED_DETAIL_FIELDS in
 * server/src/modules/hdis/service.ts — that's the list the server actually gates on. */
const DETAIL_SECTIONS: DetailSectionConfig[] = [
  {
    title: 'Requirement overview',
    fields: [
      { key: 'bigMemberName', label: 'BIG member name', required: true, type: 'text' },
      {
        key: 'requirementsReceived',
        label: 'Number of requirements received',
        required: true,
        type: 'number',
      },
      { key: 'requirementName', label: 'Requirement(s) name', required: true, type: 'text' },
      {
        key: 'engagementType',
        label: 'Requirement — Contractual/FTE',
        required: true,
        type: 'text',
      },
      {
        key: 'clientType',
        label: 'Client type',
        required: true,
        type: 'radio',
        options: ['New', 'Existing'],
      },
      {
        key: 'roleBackground',
        label: 'Role(s) background — new or replacement?',
        required: true,
        type: 'text',
      },
    ],
  },
  {
    title: 'Timeline & openings',
    fields: [
      {
        key: 'positionOpenDuration',
        label: "For how long the position has been open (at client's end)?",
        required: true,
        type: 'radio',
        options: ['0-5 days', '6-10 days', '11-20 days', 'More than a month'],
      },
      {
        key: 'hiringDeadline',
        label: 'Expected hiring timeline / specific deadline',
        required: true,
        type: 'text',
      },
      {
        key: 'interviewRoundsCount',
        label: 'Total number of interview rounds',
        required: true,
        type: 'number',
      },
      {
        key: 'interviewRoundsDefinition',
        label:
          'Define the interview rounds (e.g. Assessment, Technical, Managerial, Cultural/Fitment, Client, HR)',
        required: true,
        type: 'textarea',
      },
      {
        key: 'positionsAlreadyFilled',
        label: 'Number of positions already filled by the client',
        required: true,
        type: 'number',
      },
    ],
  },
  {
    title: "Client's internal hiring effort",
    fields: [
      {
        key: 'clientAttemptedInternalHiring',
        label: 'Has the client attempted hiring for this role internally?',
        required: true,
        type: 'yesno',
      },
      {
        key: 'internalHiringDuration',
        label: 'Duration of internal hiring effort by client',
        required: false,
        type: 'text',
      },
      {
        key: 'internalHiringChannels',
        label: "Hiring channels used by client's internal hiring team",
        required: false,
        type: 'text',
      },
      {
        key: 'internalHiringStageReached',
        label: "Stage reached in client's internal hiring process",
        required: false,
        type: 'text',
      },
      {
        key: 'internalHiringChallenges',
        label: "Key challenges or constraints identified by client's internal team",
        required: false,
        type: 'text',
      },
      {
        key: 'ctcBlockerGap',
        label: 'If CTC is a blocker, specify the exact gap',
        required: false,
        type: 'text',
      },
      {
        key: 'maxNoticePeriod',
        label: 'Maximum notice period accepted (in days)',
        required: false,
        type: 'text',
      },
      {
        key: 'targetCompaniesSuggested',
        label: 'Any target companies for sourcing suggested by client?',
        required: false,
        type: 'text',
      },
    ],
  },
  {
    title: 'Vendor & market info',
    fields: [
      {
        key: 'vayuzExclusive',
        label: 'Is VAYUZ working exclusively on this requirement?',
        required: true,
        type: 'yesno',
      },
      {
        key: 'vendorCount',
        label: 'If not, how many vendors are working on this requirement?',
        required: true,
        type: 'text',
      },
      {
        key: 'vendorsSharingProfiles',
        label: 'Have other vendors already started sharing profiles?',
        required: true,
        type: 'text',
      },
      {
        key: 'vendorSubmissionDuration',
        label: 'How long have vendors been submitting profiles?',
        required: true,
        type: 'text',
      },
      {
        key: 'duplicateProfileTimeline',
        label: 'Duplicate profiles acceptance timeline',
        required: true,
        type: 'text',
      },
    ],
  },
  {
    title: 'Commercial & closure',
    fields: [
      {
        key: 'commercialRates',
        label: 'Commercial rates provided by client (for both Contract & FTE)',
        required: true,
        type: 'text',
      },
      {
        key: 'clientPocDetails',
        label: 'Client/Prospect POC — name, contact details',
        required: true,
        type: 'text',
      },
      {
        key: 'additionalInsights',
        label: 'Any additional important insights from client conversation (BIG)?',
        required: true,
        type: 'textarea',
      },
      {
        key: 'closureConfidence',
        label: 'Confidence level for closure of this role based on the above details (BIG)',
        required: true,
        type: 'radio',
        options: ['High', 'Medium', 'Low'],
      },
      {
        key: 'exceptionNotes',
        label: "Exception (if any checklist parameter couldn't get fulfilled by the client)",
        required: false,
        type: 'textarea',
      },
      {
        key: 'atsUsed',
        label: 'Which ATS the client/prospect is using?',
        required: true,
        type: 'text',
      },
    ],
  },
];

const REQUIRED_DETAIL_KEYS = DETAIL_SECTIONS.flatMap((sec) =>
  sec.fields.filter((f) => f.required).map((f) => f.key),
);

type DetailFormState = Record<string, string>;

function detailToForm(detail: RequirementDetail | null): DetailFormState {
  const out: DetailFormState = {};
  for (const sec of DETAIL_SECTIONS) {
    for (const f of sec.fields) {
      const v = detail?.[f.key];
      if (v === null || v === undefined) out[f.key] = '';
      else if (f.type === 'yesno') out[f.key] = v ? 'Yes' : 'No';
      else out[f.key] = String(v);
    }
  }
  return out;
}

function formToPayload(form: DetailFormState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sec of DETAIL_SECTIONS) {
    for (const f of sec.fields) {
      const raw = (form[f.key] ?? '').trim();
      if (f.type === 'number') out[f.key] = raw === '' ? null : Number(raw);
      else if (f.type === 'yesno') out[f.key] = raw === '' ? null : raw === 'Yes';
      else out[f.key] = raw === '' ? null : raw;
    }
  }
  return out;
}

/**
 * The "BIG RAPYD Requirement Questionnaire" — the deeper intake details a requirement
 * needs before it can go "Active" (see REQUIRED_DETAIL_FIELDS/isDetailComplete on the
 * server). Opens automatically right after a record is created, and can be reopened
 * any time from the detail page to finish or revise it. Saving always writes the full
 * current form snapshot as a single "Save" action — there's no separate draft vs.
 * final submit step, since completeness is just computed from whichever fields (and
 * attachments) happen to be filled in at save time.
 */
function RequirementDetailModal({ record, onClose }: { record: HdisRecord; onClose: () => void }) {
  const [form, setForm] = useState<DetailFormState>(() => detailToForm(record.requirementDetail));
  const save = useSaveRequirementDetail(record.jdId);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filledRequired = REQUIRED_DETAIL_KEYS.filter((k) => (form[k] ?? '').trim() !== '').length;
  const allRequiredFilled = filledRequired === REQUIRED_DETAIL_KEYS.length;
  const hasAttachment = record.attachments.length > 0;

  function submit() {
    save.mutate(formToPayload(form));
  }

  return (
    <div role="dialog" onClick={onClose} style={overlay}>
      <div
        className="card pad"
        style={{ width: 760, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>Requirement details — {record.jdId}</SectionTitle>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          This requirement stays "Pending" — not visible as active work — until this questionnaire
          is complete. Fill in what you have now and save as a draft; come back any time to finish
          it.
        </p>
        <div
          className={`pill ${allRequiredFilled && hasAttachment ? 'p-green' : 'p-amber'}`}
          style={{ marginTop: 10, display: 'inline-flex' }}
        >
          {filledRequired}/{REQUIRED_DETAIL_KEYS.length} required fields
          {hasAttachment ? '' : ' · no attachment yet'}
        </div>

        {DETAIL_SECTIONS.map((sec) => (
          <div key={sec.title} style={{ marginTop: 20 }}>
            <div className="sec-t" style={{ marginBottom: 8 }}>
              {sec.title}
            </div>
            <div className="form-grid">
              {sec.fields.map((f) => (
                <div className={f.type === 'textarea' ? 'field full' : 'field'} key={String(f.key)}>
                  <label htmlFor={`detail-${String(f.key)}`}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      id={`detail-${String(f.key)}`}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      rows={2}
                    />
                  ) : f.type === 'number' ? (
                    <input
                      id={`detail-${String(f.key)}`}
                      type="number"
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : f.type === 'radio' ? (
                    <select
                      id={`detail-${String(f.key)}`}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === 'yesno' ? (
                    <select
                      id={`detail-${String(f.key)}`}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">Select…</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  ) : (
                    <input
                      id={`detail-${String(f.key)}`}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="muted" style={{ marginTop: 16, fontSize: 12.5 }}>
          The questionnaire's "Screenshot Attachment - Requirement Receiving Email from Client" is
          covered by the Attachments card on this record's detail page — upload it there rather than
          here.
        </p>

        {save.isError && (
          <div className="pill p-red" style={{ marginTop: 12, display: 'block' }}>
            Could not save the requirement details.
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="gho" onClick={onClose}>
            Close
          </Btn>
          <Btn onClick={submit} disabled={save.isPending}>
            {allRequiredFilled ? 'Save details' : 'Save draft'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const AGING_TRANSITION_LABELS: {
  key: 'R0->R1' | 'R1->R2' | 'R2->R3' | 'R3->R4' | 'R4->R5';
  label: string;
}[] = [
  { key: 'R0->R1', label: 'R0 → R1' },
  { key: 'R1->R2', label: 'R1 → R2' },
  { key: 'R2->R3', label: 'R2 → R3' },
  { key: 'R3->R4', label: 'R3 → R4' },
  { key: 'R4->R5', label: 'R4 → R5' },
];

/** How long this requirement has taken to move through the pipeline — total days
 * (reqDate -> now, frozen at the last stage reached once closed/fulfilled) plus a
 * per-transition breakdown (R0->R1, R1->R2, etc.), sourced from HdisStageEvent rows
 * recorded automatically whenever the pipeline counts are edited (see PipelineRecorder). */
function ProfileAgingCard({ rec }: { rec: HdisRecord }) {
  return (
    <Card>
      <SectionTitle color="var(--teal)">Profile Aging</SectionTitle>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--teal)' }}>
          {rec.aging.totalDays}
        </span>
        <span className="skc-sub">total days since raised</span>
      </div>
      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {AGING_TRANSITION_LABELS.map(({ key, label }) => {
          const v = rec.aging.transitions[key];
          return (
            <div className="mini" key={key}>
              <div className="l">{label}</div>
              <div className="v">{v === null ? '—' : `${v}d`}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function HdisDetail({ jdId }: { jdId: string }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Preserves whatever filters were applied on the list page across the round trip
  // into a record and back — falls back to a plain list link if opened directly.
  const backTo = (location.state as { backTo?: string } | null)?.backTo ?? '/hdis';
  const canEditAll = can(me, 'hdis', 'edit');
  const { data: rec, isLoading } = useHdisRecord(jdId);
  const { data: activity = [] } = useHdisActivity(jdId);
  const [editing, setEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Same rule as the list: blanket edit, or being personally listed as an owner of
  // this specific record.
  const editable = canEditAll || (!!me?.name && !!rec?.owners.includes(me.name));

  if (isLoading || !rec) {
    return (
      <AppShell title="HDIS record">
        <Card>Loading…</Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={rec.title} subtitle={`${rec.jdId} · ${rec.client}`}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button className="lnk" onClick={() => navigate(backTo)}>
          ← Back to list
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          {editable && (
            <Btn variant="gho" onClick={() => setShowDetails(true)}>
              Requirement details
            </Btn>
          )}
          {editable && <Btn onClick={() => setEditing(true)}>Edit record</Btn>}
        </div>
      </div>
      <div className="dbanner" style={{ marginBottom: 16 }}>
        <div className="db-eyebrow">{rec.type}</div>
        <div className="db-title">{rec.title}</div>
        <div className="db-sub">
          {rec.client} · {rec.jdId}
        </div>
        <div className="db-meta">
          <div className="db-item">
            <div className="dl">Status</div>
            <div className="dv">
              <Pill>{rec.status}</Pill>
              {rec.statusReason && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {' '}
                  · {rec.statusReason}
                </span>
              )}
            </div>
          </div>
          <div className="db-item">
            <div className="dl">Requirement date</div>
            <div className="dv">{formatDate(rec.reqDate)}</div>
          </div>
          <div className="db-item">
            <div className="dl">Priority</div>
            <div className="dv">{priorityLabel(rec.priority)}</div>
          </div>
          <div className="db-item">
            <div className="dl">Positions</div>
            <div className="dv">{rec.openings}</div>
          </div>
          <div className="db-item">
            <div className="dl">Owners</div>
            <div className="dv">{rec.owners.join(', ') || '—'}</div>
          </div>
          <div className="db-item">
            <div className="dl">JD link</div>
            <div className="dv">
              {rec.jdLink ? (
                <a href={rec.jdLink} style={{ color: '#FCD34D' }}>
                  Open
                </a>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>
      </div>

      {rec.status === 'Pending' && (
        <div style={{ marginBottom: 16 }}>
          <Card>
            <SectionTitle color="var(--gold)">Not active yet</SectionTitle>
            <p style={{ marginTop: 10 }}>
              This requirement stays "Pending" — excluded from live tiles and reports — until the
              requirement questionnaire is complete
              {rec.attachments.length === 0 ? ' and at least one attachment is on file' : ''}.
              {editable && ' Fill it in below to unlock Active.'}
            </p>
            {editable && (
              <Btn small onClick={() => setShowDetails(true)}>
                Complete requirement details
              </Btn>
            )}
          </Card>
        </div>
      )}

      {rec.remarks && (
        <div style={{ marginBottom: 16 }}>
          <Card>
            <SectionTitle color="var(--gold)">Remarks</SectionTitle>
            <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{rec.remarks}</p>
          </Card>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <ProfileAgingCard rec={rec} />
      </div>

      <Attachments rec={rec} editable={editable} />

      <CandidatesCard rec={rec} editable={editable} />

      <div className="grid g-58">
        {editable ? (
          <PipelineRecorder rec={rec} />
        ) : (
          <Card>
            <SectionTitle>Pipeline</SectionTitle>
            <div className="grid g-3" style={{ marginTop: 12 }}>
              {rec.pipeline &&
                (['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const).map((k) => (
                  <div className="mini" key={k}>
                    <div className="l">{k.toUpperCase()}</div>
                    <div className="v">{rec.pipeline![k]}</div>
                  </div>
                ))}
            </div>
          </Card>
        )}
        <Card>
          <SectionTitle color="var(--sky)">Activity log</SectionTitle>
          <div style={{ marginTop: 12 }}>
            {activity.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : (
              activity.map((a) => (
                <div className="log" key={a.id}>
                  <span className="w">{formatDateTime(a.at)}</span>
                  <span className="who">{a.actor}</span>
                  <span>
                    <b>{a.action}</b> — {a.detail}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {editing && <HdisFormModal mode="edit" initial={rec} onClose={() => setEditing(false)} />}
      {showDetails && <RequirementDetailModal record={rec} onClose={() => setShowDetails(false)} />}
    </AppShell>
  );
}

function Attachments({ rec, editable }: { rec: HdisRecord; editable: boolean }) {
  const qc = useApiMutation(
    async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api(`/hdis/${rec.jdId}/attachments`, { method: 'POST', body: fd, isForm: true });
    },
    [
      ['hdis-record', rec.jdId],
      ['hdis-activity', rec.jdId],
    ],
  );
  const setLink = useSetHdisLink(rec.jdId);
  const [linkDraft, setLinkDraft] = useState(rec.jdLink ?? '');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function saveLink() {
    const value = linkDraft.trim();
    setLinkError(null);
    setLink.mutate(value || null, {
      onError: (err) =>
        setLinkError(err instanceof Error ? err.message : 'Could not save that link'),
    });
  }

  return (
    <Card className="">
      <SectionTitle color="var(--violet)">Attachments</SectionTitle>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 12px' }}>
        Upload the JD document (PDF/Word), or the requirement questionnaire's screenshot of the
        requirement-receiving email (PNG/JPG) — or add a JD link instead if it's hosted elsewhere.
      </p>
      <div>
        {rec.attachments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No documents attached.
          </p>
        ) : (
          rec.attachments.map((a) => (
            <div className="log attach" key={a.id}>
              <a
                className="lnk"
                href={apiUrl(`/api/hdis/${rec.jdId}/attachments/${a.id}`)}
                data-testid="attachment-link"
              >
                {a.fileName}
              </a>
              <span className="muted">{(a.size / 1024).toFixed(1)} KB</span>
            </div>
          ))
        )}
        {editable && (
          <div style={{ marginTop: 14 }}>
            <input
              type="file"
              aria-label="Upload attachment"
              accept="application/pdf,.pdf,.doc,.docx,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadError(null);
                  qc.mutate(f, {
                    onError: (err) =>
                      setUploadError(
                        err instanceof Error ? err.message : 'Could not upload that file',
                      ),
                  });
                }
                e.target.value = '';
              }}
            />
            {qc.isPending && <span className="muted"> Uploading…</span>}
            {uploadError && (
              <div className="pill p-red" style={{ marginTop: 8, display: 'inline-block' }}>
                {uploadError}
              </div>
            )}
          </div>
        )}
        {editable ? (
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="jd-link">JD link</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="jd-link"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="https://…"
              />
              <button
                type="button"
                className="btn btn-gho btn-sm"
                onClick={saveLink}
                disabled={setLink.isPending || linkDraft.trim() === (rec.jdLink ?? '')}
              >
                Save
              </button>
            </div>
            {linkError && (
              <div className="pill p-red" style={{ marginTop: 6, display: 'inline-block' }}>
                {linkError}
              </div>
            )}
          </div>
        ) : rec.jdLink ? (
          <div style={{ marginTop: 14 }}>
            <a className="lnk" href={rec.jdLink}>
              Open JD link
            </a>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

const CANDIDATE_STAGES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'] as const;
const CANDIDATE_STAGE_LABELS: Record<string, string> = {
  R0: 'R0 · Sourcing',
  R1: 'R1 · Shortlist',
  R2: 'R2 · L1',
  R3: 'R3 · L2',
  R4: 'R4 · L3',
  R5: 'R5 · Onboarded',
};
const CANDIDATE_STATUSES = ['Active', 'Offered', 'Joined', 'Dropped'] as const;
const CANDIDATE_STATUS_TONE: Record<string, string> = {
  Active: 'p-blue',
  Offered: 'p-amber',
  Joined: 'p-green',
  Dropped: 'p-red',
};

/** Named candidates submitted against this requirement — the granular data behind the
 * (future) Performance Scorecard: closures, L2/L3 conversion, TAT, dropout rate,
 * tech-stack expertise, interview->offer / offer->joining ratios. Distinct from the
 * Pipeline card above, which only tracks aggregate R0-R5 headcounts with no notion of
 * who each person is. */
function CandidatesCard({ rec, editable }: { rec: HdisRecord; editable: boolean }) {
  const { data: candidates = [], isLoading } = useCandidates(rec.jdId);
  const [adding, setAdding] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const remove = useDeleteCandidate(rec.jdId);

  function removeCandidate(c: Candidate) {
    if (!window.confirm(`Remove candidate "${c.name}" from this requirement?`)) return;
    remove.mutate(c.id);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Card pad={false}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 16px 0',
          }}
        >
          <SectionTitle color="var(--violet)">Candidates</SectionTitle>
          {editable && (
            <Btn small onClick={() => setAdding(true)}>
              + Add candidate
            </Btn>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {isLoading ? (
            <p className="muted">Loading…</p>
          ) : candidates.length === 0 ? (
            <Empty title="No candidates logged yet" icon="🧑\u200d💼">
              Add named candidates as they're submitted — this powers per-recruiter performance
              metrics like closures, L2/L3 conversion, and dropout rate.
            </Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl hover plain">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tech stack</th>
                    <th>Owner</th>
                    <th>Stage</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Closed</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="muted">{c.techStack || '—'}</td>
                      <td>{c.ownerName}</td>
                      <td>{CANDIDATE_STAGE_LABELS[c.stage] ?? c.stage}</td>
                      <td>
                        <span className={`pill ${CANDIDATE_STATUS_TONE[c.status] ?? ''}`}>
                          {c.status}
                        </span>
                        {c.status === 'Dropped' && c.dropReason && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {c.dropReason}
                          </div>
                        )}
                      </td>
                      <td className="muted">{formatDate(c.submittedAt)}</td>
                      <td className="muted">{c.closedAt ? formatDate(c.closedAt) : '—'}</td>
                      {editable && (
                        <td>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="lnk"
                              onClick={() => setEditingCandidate(c)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="lnk"
                              style={{ color: 'var(--danger, #c0392b)' }}
                              onClick={() => removeCandidate(c)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
      {adding && <CandidateFormModal rec={rec} mode="create" onClose={() => setAdding(false)} />}
      {editingCandidate && (
        <CandidateFormModal
          rec={rec}
          mode="edit"
          initial={editingCandidate}
          onClose={() => setEditingCandidate(null)}
        />
      )}
    </div>
  );
}

interface CandidateFormState {
  name: string;
  techStack: string;
  ownerName: string;
  stage: string;
  status: string;
  dropReason: string;
  submittedAt: string;
  offeredAt: string;
  closedAt: string;
}

function candidateToForm(rec: HdisRecord, initial?: Candidate): CandidateFormState {
  return {
    name: initial?.name ?? '',
    techStack: initial?.techStack ?? '',
    ownerName: initial?.ownerName ?? rec.owners[0] ?? '',
    stage: initial?.stage ?? 'R0',
    status: initial?.status ?? 'Active',
    dropReason: initial?.dropReason ?? '',
    submittedAt: initial?.submittedAt ?? todayISO(),
    offeredAt: initial?.offeredAt ?? '',
    closedAt: initial?.closedAt ?? '',
  };
}

function CandidateFormModal({
  rec,
  mode,
  initial,
  onClose,
}: {
  rec: HdisRecord;
  mode: 'create' | 'edit';
  initial?: Candidate;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CandidateFormState>(() => candidateToForm(rec, initial));
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCandidate(rec.jdId);
  const update = useUpdateCandidate(rec.jdId);
  const pending = create.isPending || update.isPending;

  function set<K extends keyof CandidateFormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    if (!form.name.trim() || !form.ownerName.trim() || !form.submittedAt) return;
    if (form.status === 'Dropped' && !form.dropReason.trim()) {
      setError('Add a reason for the drop');
      return;
    }
    setError(null);
    const payload = {
      name: form.name.trim(),
      techStack: form.techStack.trim() || null,
      ownerName: form.ownerName.trim(),
      stage: form.stage,
      status: form.status,
      dropReason: form.status === 'Dropped' ? form.dropReason.trim() : null,
      submittedAt: form.submittedAt,
      offeredAt: form.offeredAt || null,
      closedAt: form.closedAt || null,
    };
    const onErr = (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not save this candidate');
    if (mode === 'create') {
      create.mutate(payload, { onSuccess: onClose, onError: onErr });
    } else if (initial) {
      update.mutate({ id: initial.id, ...payload }, { onSuccess: onClose, onError: onErr });
    }
  }

  return (
    <div role="dialog" onClick={onClose} style={overlay}>
      <div
        className="card pad"
        style={{ width: 560, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>{mode === 'create' ? 'Add candidate' : 'Edit candidate'}</SectionTitle>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="cand-name">Name *</label>
            <input id="cand-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cand-tech">Tech stack</label>
            <input
              id="cand-tech"
              value={form.techStack}
              onChange={(e) => set('techStack', e.target.value)}
              placeholder="Java, .NET, DevOps…"
            />
          </div>
          <div className="field">
            <label htmlFor="cand-owner">Owner (recruiter) *</label>
            <input
              id="cand-owner"
              list="cand-owner-options"
              value={form.ownerName}
              onChange={(e) => set('ownerName', e.target.value)}
            />
            <datalist id="cand-owner-options">
              {rec.owners.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="cand-stage">Stage</label>
            <select
              id="cand-stage"
              value={form.stage}
              onChange={(e) => set('stage', e.target.value)}
            >
              {CANDIDATE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cand-status">Status</label>
            <select
              id="cand-status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cand-submitted">Submitted *</label>
            <input
              id="cand-submitted"
              type="date"
              value={form.submittedAt}
              onChange={(e) => set('submittedAt', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cand-offered">Offered</label>
            <input
              id="cand-offered"
              type="date"
              value={form.offeredAt}
              onChange={(e) => set('offeredAt', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cand-closed">Closed (joined/dropped)</label>
            <input
              id="cand-closed"
              type="date"
              value={form.closedAt}
              onChange={(e) => set('closedAt', e.target.value)}
            />
          </div>
          {form.status === 'Dropped' && (
            <div className="field full">
              <label htmlFor="cand-drop-reason">Drop reason *</label>
              <input
                id="cand-drop-reason"
                value={form.dropReason}
                onChange={(e) => set('dropReason', e.target.value)}
                placeholder="e.g. Candidate accepted another offer"
              />
            </div>
          )}
        </div>
        {error && (
          <div className="pill p-red" style={{ marginTop: 12, display: 'inline-block' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <Btn variant="gho" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit} disabled={pending}>
            {mode === 'create' ? 'Add candidate' : 'Save changes'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const PL_STAGES = [
  'On Hold',
  'R0 · Sourcing',
  'R1 · Shortlist',
  'R2 · L1',
  'R3 · L2',
  'R4 · L3',
  'R5 · Onboarded',
  'Closed',
];

function PipelineRecorder({ rec }: { rec: HdisRecord }) {
  const save = useApiMutation(
    (body: Record<string, unknown>) => api(`/hdis/${rec.jdId}/pipeline`, { method: 'PUT', body }),
    [
      ['hdis-record', rec.jdId],
      ['hdis-activity', rec.jdId],
    ],
  );
  const p = rec.pipeline ?? { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, stage: 'R0 · Sourcing' };
  const [vals, setVals] = useState({ r0: p.r0, r1: p.r1, r2: p.r2, r3: p.r3, r4: p.r4, r5: p.r5 });
  const [stage, setStage] = useState(p.stage);
  const labels = [
    'R0 · Profiles',
    'R1 · Shortlist',
    'R2 · L1',
    'R3 · L2',
    'R4 · L3',
    'R5 · Onboarded',
  ];

  return (
    <Card>
      <SectionTitle color="var(--green)">Record pipeline activity</SectionTitle>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 14px' }}>
        Update stage counts and status. Each save is written to the activity log.
      </p>
      <div className="grid g-3">
        {(['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const).map((k, i) => (
          <div className="field" key={k}>
            <label>{labels[i]}</label>
            <input
              type="number"
              min={0}
              value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: Math.max(0, Number(e.target.value)) })}
            />
          </div>
        ))}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Stage / status</label>
        <select value={stage} onChange={(e) => setStage(e.target.value)}>
          {PL_STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 14 }}>
        <Btn onClick={() => save.mutate({ ...vals, stage })} disabled={save.isPending}>
          Log update
        </Btn>
      </div>
    </Card>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,.5)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 60,
  padding: 20,
};
