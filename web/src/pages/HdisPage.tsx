import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Pill, Empty, Btn } from '../components/ui';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import { useHdisList, useHdisRecord, useHdisActivity, useApiMutation } from '../lib/hooks';
import type { HdisRecord } from '../lib/types';

const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

export default function HdisPage() {
  const { jdId } = useParams();
  if (jdId) return <HdisDetail jdId={jdId} />;
  return <HdisList />;
}

function HdisList() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const { data: rows = [], isLoading } = useHdisList({ month });
  const canAdd = can(me, 'hdis', 'add');

  return (
    <AppShell title="HDIS" subtitle="Hiring Display Information System — requirement master">
      <div
        className="card pad"
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          className={`btn btn-sm ${!month ? 'btn-pri' : 'btn-gho'}`}
          onClick={() => setMonth(undefined)}
        >
          All
        </button>
        {MONTHS.map((m) => (
          <button
            key={m}
            className={`btn btn-sm ${month === m ? 'btn-pri' : 'btn-gho'}`}
            onClick={() => setMonth(m)}
          >
            {m}
          </button>
        ))}
        {canAdd && (
          <div style={{ marginLeft: 'auto' }}>
            <Btn onClick={() => setShowAdd(true)}>+ Add record</Btn>
          </div>
        )}
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <Empty title="No HDIS records" icon="▤" />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl hover">
              <thead>
                <tr>
                  <th>JD ID</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Owners</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.jdId} onClick={() => navigate(`/hdis/${r.jdId}`)}>
                    <td className="mono">{r.jdId}</td>
                    <td>{r.title}</td>
                    <td>{r.client}</td>
                    <td>
                      <Pill>{r.type}</Pill>
                    </td>
                    <td>
                      <Pill>{r.status}</Pill>
                    </td>
                    <td className="muted">{r.owners.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && <AddHdisModal onClose={() => setShowAdd(false)} />}
    </AppShell>
  );
}

function AddHdisModal({ onClose }: { onClose: () => void }) {
  const create = useApiMutation(
    (body: Record<string, unknown>) => api<HdisRecord>('/hdis', { method: 'POST', body }),
    [['hdis', {}]],
  );
  const [form, setForm] = useState({
    jdId: '',
    title: '',
    client: '',
    type: 'RADC',
    status: 'Active',
    reqDate: '2026-06-01',
    jdLink: '',
  });
  const [owners, setOwners] = useState<string[]>([]);
  const [ownerInput, setOwnerInput] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function addOwner() {
    const v = ownerInput.trim();
    if (v && !owners.includes(v)) setOwners([...owners, v]);
    setOwnerInput('');
  }

  function submit() {
    create.mutate(
      {
        ...form,
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
        style={{ width: 620, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>New HDIS record</SectionTitle>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>JD ID</label>
            <input
              value={form.jdId}
              onChange={(e) => set('jdId', e.target.value)}
              placeholder="VAY_XX_20260601"
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
            <label>Client</label>
            <input value={form.client} onChange={(e) => set('client', e.target.value)} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option>RADC</option>
              <option>RADF</option>
              <option>Internal</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option>Active</option>
              <option>On Hold</option>
              <option>Closed</option>
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
        {create.isError && (
          <div className="pill p-red" style={{ marginTop: 12, display: 'block' }}>
            Could not save — check the JD ID is unique.
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="gho" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit} disabled={create.isPending}>
            Save record
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

  if (isLoading || !rec) {
    return (
      <AppShell title="HDIS record">
        <Card>Loading…</Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={rec.title} subtitle={`${rec.jdId} · ${rec.client}`}>
      <button className="lnk" onClick={() => navigate('/hdis')} style={{ marginBottom: 12 }}>
        ← Back to list
      </button>
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
                  <span className="w">{a.at.slice(0, 16).replace('T', ' ')}</span>
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
    </AppShell>
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
