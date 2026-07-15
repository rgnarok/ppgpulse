import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Pill, Empty, Btn } from '../components/ui';
import { SearchableSelect } from '../components/SearchableSelect';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api, apiUrl } from '../lib/api';
import {
  useHdisList,
  useHdisRecord,
  useHdisActivity,
  useClients,
  useApiMutation,
} from '../lib/hooks';
import { formatDate, formatMonth, formatDateTime } from '../lib/format';
import type { HdisRecord } from '../lib/types';

const TYPE_OPTIONS = ['RADC', 'RADF', 'Internal'];
const STATUS_OPTIONS = ['Active', 'On Hold', 'Closed'];

function distinctSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

export default function HdisPage() {
  const { jdId } = useParams();
  if (jdId) return <HdisDetail jdId={jdId} />;
  return <HdisList />;
}

interface HdisFilters {
  month: string;
  client: string;
  owner: string;
  type: string;
  status: string;
  q: string;
}
const EMPTY_FILTERS: HdisFilters = {
  month: '',
  client: '',
  owner: '',
  type: '',
  status: '',
  q: '',
};

function HdisList() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<HdisFilters>(EMPTY_FILTERS);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HdisRecord | null>(null);
  // Filtering happens client-side across the full set — the dataset is small enough
  // (dozens to low hundreds of records) that this is instant and keeps every filter
  // (month/client/owner/type/status/search) trivially composable without round-trips.
  const { data: rows = [], isLoading } = useHdisList({});
  const canAdd = can(me, 'hdis', 'add');
  const canEdit = can(me, 'hdis', 'edit');

  const months = useMemo(
    () => distinctSorted(rows.map((r) => r.reqDate.slice(0, 7))).sort((a, b) => b.localeCompare(a)),
    [rows],
  );
  const clients = useMemo(() => distinctSorted(rows.map((r) => r.client)), [rows]);
  const owners = useMemo(() => distinctSorted(rows.flatMap((r) => r.owners)), [rows]);

  const set = (patch: Partial<HdisFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.month && r.reqDate.slice(0, 7) !== filters.month) return false;
      if (filters.client && r.client !== filters.client) return false;
      if (filters.owner && !r.owners.includes(filters.owner)) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (needle) {
        const hay = `${r.title} ${r.client} ${r.jdId}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <AppShell title="HDIS" subtitle="Hiring Display Information System — requirement master">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar" style={{ flexWrap: 'wrap' }}>
          <div className="field">
            <label htmlFor="hdis-month">Month</label>
            <select
              id="hdis-month"
              value={filters.month}
              onChange={(e) => set({ month: e.target.value })}
            >
              <option value="">All months</option>
              {months.map((m) => (
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
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="hdis-search">Search</label>
            <input
              id="hdis-search"
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Title, client, or JD ID"
            />
          </div>
          <button
            type="button"
            className="btn btn-gho"
            disabled={!hasFilters}
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Reset
          </button>
          {canAdd && (
            <div style={{ marginLeft: 'auto' }}>
              <Btn onClick={() => setShowAdd(true)}>+ Add record</Btn>
            </div>
          )}
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
                  <th>Status</th>
                  <th>Owners</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.jdId} onClick={() => navigate(`/hdis/${r.jdId}`)}>
                    <td className="mono">{r.jdId}</td>
                    <td className="muted">{formatDate(r.reqDate)}</td>
                    <td>{r.title}</td>
                    <td>{r.client}</td>
                    <td>
                      <Pill>{r.type}</Pill>
                    </td>
                    <td>
                      <Pill>{r.status}</Pill>
                    </td>
                    <td className="muted">{r.owners.join(', ')}</td>
                    {canEdit && (
                      <td>
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
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  const { data: clientRows = [] } = useClients();
  const clientNames = useMemo(() => clientRows.map((c) => c.name), [clientRows]);

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
    status: initial?.status ?? 'Active',
    reqDate: initial?.reqDate ?? '2026-06-01',
    jdLink: initial?.jdLink ?? '',
  }));
  const [owners, setOwners] = useState<string[]>(initial?.owners ?? []);
  const [ownerInput, setOwnerInput] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function addOwner() {
    const v = ownerInput.trim();
    if (v && !owners.includes(v)) setOwners([...owners, v]);
    setOwnerInput('');
  }

  function submit() {
    if (mode === 'edit') {
      update.mutate(
        {
          title: form.title,
          client: form.client,
          type: form.type,
          status: form.status,
          reqDate: form.reqDate,
          jdLink: form.jdLink || null,
          owners,
        },
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(
      { ...form, jdLink: form.jdLink || null, openings: 1, owners },
      { onSuccess: onClose },
    );
  }

  return (
    <div role="dialog" onClick={onClose} style={overlay}>
      <div
        className="card pad"
        style={{ width: 620, maxWidth: '100%' }}
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
            <label>JD link</label>
            <input
              value={form.jdLink}
              onChange={(e) => set('jdLink', e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="field full">
            <label>Owners</label>
            <div className="ms-box">
              {owners.map((o) => (
                <span className="ms-chip" key={o}>
                  {o}
                  <button onClick={() => setOwners(owners.filter((x) => x !== o))}>×</button>
                </span>
              ))}
              <input
                style={{ border: 'none', flex: 1, minWidth: 120 }}
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOwner())}
                placeholder="Add owner + Enter"
              />
            </div>
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
  const editable = can(me, 'hdis', 'edit');
  const { data: rec, isLoading } = useHdisRecord(jdId);
  const { data: activity = [] } = useHdisActivity(jdId);
  const [editing, setEditing] = useState(false);

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
        <button className="lnk" onClick={() => navigate('/hdis')}>
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
            <div className="dv">{rec.status}</div>
          </div>
          <div className="db-item">
            <div className="dl">Requirement date</div>
            <div className="dv">{formatDate(rec.reqDate)}</div>
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

  return (
    <Card className="">
      <SectionTitle color="var(--violet)">Attachments</SectionTitle>
      <div style={{ marginTop: 12 }}>
        {rec.attachments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No documents attached.
          </p>
        ) : (
          rec.attachments.map((a) => (
            <div className="log" key={a.id}>
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
          <div style={{ marginTop: 12 }}>
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
