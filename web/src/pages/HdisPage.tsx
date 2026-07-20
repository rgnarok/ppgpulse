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
} from '../lib/hooks';
import { formatDate, formatMonth, formatDateTime, todayISO } from '../lib/format';
import { fyOfMonth, fyLabel, fyMonths, fiscalYearsFor } from '../lib/fy';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import type { HdisRecord } from '../lib/types';

const TYPE_OPTIONS = ['RADC', 'RADF', 'Internal'];
const STATUS_OPTIONS = ['Active', 'On Hold', 'Fulfilled', 'Closed'];
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

/** Total count plus a RADC/RADF split — powers the two headline stat cards. */
function typeBreakdown(records: HdisRecord[]) {
  return {
    total: records.length,
    radc: records.filter((r) => r.type === 'RADC').length,
    radf: records.filter((r) => r.type === 'RADF').length,
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

function HdisList() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filters, setFiltersState] = useState<HdisFilters>(() => filtersFromParams(params));
  const [page, setPageState] = useState(() => Number(params.get('page')) || 1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HdisRecord | null>(null);
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
  const fys = useMemo(() => fiscalYearsFor(dataMonths), [dataMonths]);
  // Month options are the fiscal year's Apr–Mar span, narrowed to months that actually
  // have records — matches the "Jun 2026" style used everywhere else on the platform.
  const monthsInFy = useMemo(() => {
    if (!filters.fy) return [];
    const dataSet = new Set(dataMonths);
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
      if (filters.status && r.status !== filters.status) return false;
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

      {showAdd && <HdisFormModal mode="create" onClose={() => setShowAdd(false)} />}
      {editing && <HdisFormModal mode="edit" initial={editing} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

function HdisFormModal({
  mode,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit';
  initial?: HdisRecord;
  onClose: () => void;
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
          owners,
        },
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(
      {
        ...form,
        statusReason: form.statusReason || null,
        remarks: form.remarks.trim() || null,
        jdLink: form.jdLink || null,
        openings: 1,
        owners,
      },
      { onSuccess: onClose },
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
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
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
        {editable && <Btn onClick={() => setEditing(true)}>Edit record</Btn>}
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
              {rec.status}
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
            <div className="dl">Openings</div>
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

      {rec.remarks && (
        <div style={{ marginBottom: 16 }}>
          <Card>
            <SectionTitle color="var(--gold)">Remarks</SectionTitle>
            <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{rec.remarks}</p>
          </Card>
        </div>
      )}

      <Attachments rec={rec} editable={editable} />

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
        For the Job Description (JD) document — upload a file, or add a link instead if it's hosted
        elsewhere.
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
              accept="application/pdf,.pdf,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) qc.mutate(f);
              }}
            />
            {qc.isPending && <span className="muted"> Uploading…</span>}
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
