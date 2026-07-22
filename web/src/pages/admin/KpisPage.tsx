import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Empty, Btn, Pill } from '../../components/ui';
import {
  useKpis,
  useCreateKpi,
  useUpdateKpi,
  useDeleteKpi,
  KPI_PERIODICITY_OPTIONS,
  type KpiRow,
  type KpiInput,
} from '../../lib/hooks';

export default function KpisPage() {
  const { data: kpis = [], isLoading } = useKpis();
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; initial?: KpiRow } | null>(null);
  const [deleting, setDeleting] = useState<KpiRow | null>(null);
  const deleteKpi = useDeleteKpi();

  return (
    <AppShell
      title="KPIs"
      subtitle="People Group scorecard — the metrics every PPG consultant is measured against"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Btn onClick={() => setModal({ mode: 'create' })}>+ Add KPI</Btn>
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : kpis.length === 0 ? (
          <Empty title="No KPIs defined yet" icon="🎯">
            Add the People Group's scorecard metrics — target, cadence, and why each one matters —
            so they're visible in one place.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>KPI</th>
                  <th>Target</th>
                  <th>Periodicity</th>
                  <th>Description</th>
                  <th>Why it's important</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id}>
                    <td className="mono">{k.kpiNo}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={{ marginRight: 6 }}>{k.symbol}</span>
                      {k.title}
                    </td>
                    <td style={{ fontWeight: 600 }}>{k.target}</td>
                    <td>
                      <Pill tone="p-grey">{k.periodicity}</Pill>
                    </td>
                    <td style={{ maxWidth: 320 }}>{k.description}</td>
                    <td className="muted" style={{ maxWidth: 260 }}>
                      {k.whyItMatters ?? '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {k.trackedMetric && (
                          <Link className="lnk" to={`/admin/kpis/${k.id}/tracking`}>
                            Track
                          </Link>
                        )}
                        <button
                          className="lnk"
                          onClick={() => setModal({ mode: 'edit', initial: k })}
                        >
                          Edit
                        </button>
                        <button
                          className="lnk"
                          style={{ color: 'var(--danger, #c0392b)' }}
                          onClick={() => setDeleting(k)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <KpiFormModal mode={modal.mode} initial={modal.initial} onClose={() => setModal(null)} />
      )}
      {deleting && (
        <ConfirmDeleteModal
          kpi={deleting}
          pending={deleteKpi.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteKpi.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AppShell>
  );
}

function ConfirmDeleteModal({
  kpi,
  pending,
  onCancel,
  onConfirm,
}: {
  kpi: KpiRow;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-label="Remove KPI" onClick={onCancel} style={overlay}>
      <div
        className="card pad"
        style={{ width: 420, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>Remove KPI</SectionTitle>
        <p style={{ marginTop: 10, fontSize: 14 }}>
          Remove KPI {kpi.kpiNo} — <strong>{kpi.title}</strong>? This can't be undone.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="gho" onClick={onCancel}>
            Cancel
          </Btn>
          <Btn onClick={onConfirm} disabled={pending}>
            {pending ? 'Removing…' : 'Remove'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function KpiFormModal({
  mode,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit';
  initial?: KpiRow;
  onClose: () => void;
}) {
  const create = useCreateKpi();
  const update = useUpdateKpi();
  const mutation = mode === 'edit' ? update : create;

  const [form, setForm] = useState(() => ({
    kpiNo: String(initial?.kpiNo ?? ''),
    symbol: initial?.symbol ?? '',
    title: initial?.title ?? '',
    target: initial?.target ?? '',
    description: initial?.description ?? '',
    periodicity: initial?.periodicity ?? KPI_PERIODICITY_OPTIONS[0],
    whyItMatters: initial?.whyItMatters ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    const kpiNo = Number(form.kpiNo);
    if (!kpiNo || kpiNo <= 0) {
      setError('KPI No. must be a positive number');
      return;
    }
    if (
      !form.symbol.trim() ||
      !form.title.trim() ||
      !form.target.trim() ||
      !form.description.trim()
    ) {
      setError('Symbol, title, target, and description are required');
      return;
    }
    setError(null);
    const input: KpiInput = {
      kpiNo,
      symbol: form.symbol.trim(),
      title: form.title.trim(),
      target: form.target.trim(),
      description: form.description.trim(),
      periodicity: form.periodicity,
      whyItMatters: form.whyItMatters.trim() || undefined,
    };
    const onSettled = {
      onSuccess: onClose,
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not save this KPI'),
    };
    if (mode === 'edit' && initial) {
      update.mutate({ id: initial.id, input }, onSettled);
    } else {
      create.mutate(input, onSettled);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={mode === 'edit' ? 'Edit KPI' : 'Add KPI'}
      onClick={onClose}
      style={overlay}
    >
      <div
        className="card pad"
        style={{ width: 620, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>{mode === 'edit' ? `Edit KPI ${initial?.kpiNo}` : 'Add KPI'}</SectionTitle>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="kpi-no">KPI No.</label>
            <input
              id="kpi-no"
              type="number"
              min={1}
              value={form.kpiNo}
              onChange={(e) => set('kpiNo', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="kpi-symbol">Symbol</label>
            <input
              id="kpi-symbol"
              value={form.symbol}
              onChange={(e) => set('symbol', e.target.value)}
              placeholder="🗂️"
            />
          </div>
          <div className="field full">
            <label htmlFor="kpi-title">Title</label>
            <input
              id="kpi-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Trello-based Day Planning"
            />
          </div>
          <div className="field">
            <label htmlFor="kpi-target">Target</label>
            <input
              id="kpi-target"
              value={form.target}
              onChange={(e) => set('target', e.target.value)}
              placeholder="≥ 5 / day"
            />
          </div>
          <div className="field">
            <label htmlFor="kpi-periodicity">Periodicity</label>
            <select
              id="kpi-periodicity"
              value={form.periodicity}
              onChange={(e) => set('periodicity', e.target.value)}
            >
              {KPI_PERIODICITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label htmlFor="kpi-description">Description</label>
            <textarea
              id="kpi-description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What this KPI measures and how it's calculated"
              rows={3}
            />
          </div>
          <div className="field full">
            <label htmlFor="kpi-why">Why it's important (optional)</label>
            <textarea
              id="kpi-why"
              value={form.whyItMatters}
              onChange={(e) => set('whyItMatters', e.target.value)}
              placeholder="The impact this KPI drives"
              rows={2}
            />
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
          <Btn variant="gho" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save KPI'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,.5)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 60,
  padding: 20,
};
