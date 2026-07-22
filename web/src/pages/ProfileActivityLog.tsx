import { useMemo, useState, type CSSProperties } from 'react';
import { Card, SectionTitle, Btn } from '../components/ui';
import {
  useConsultantLogMonth,
  useConsultantLogDay,
  useCreateConsultantLog,
  useUpdateConsultantLog,
  useDeleteConsultantLog,
  type ConsultantLogRow,
  type ConsultantLogInput,
} from '../lib/hooks';
import { formatDate, formatMonth } from '../lib/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** Self-service "My activity" calendar shown on the Profile page for consultants and
 * HR managers — mirrors the Interviews page's month-calendar + day-log pattern, but for
 * events hosted/participated, insights, and remarks (distinct from the lifetime totals
 * shown in the "Your stats" card above). */
export default function ProfileActivityLog() {
  const today = useMemo(() => todayISO(), []);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ConsultantLogRow | null>(null);

  const { data: monthData } = useConsultantLogMonth(month);
  const counts = monthData?.counts ?? {};
  const { data: entries = [] } = useConsultantLogDay(selected);
  const removeLog = useDeleteConsultantLog();

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <SectionTitle>My activity — {formatMonth(month)}</SectionTitle>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="pal-month">Month</label>
          <input
            id="pal-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

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
              className={[
                'cal-c',
                counts[date] ? 'has' : '',
                date === today ? 'today' : '',
                date === selected ? 'sel' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(date)}
            >
              <div className="cn">{Number(date.slice(-2))}</div>
              {counts[date] ? <div className="cal-b">{counts[date]}</div> : null}
            </div>
          ),
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <strong style={{ fontSize: 14 }}>{formatDate(selected)}</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            </div>
          </div>
          <Btn small onClick={() => setAddOpen(true)}>
            + Add entry
          </Btn>
        </div>

        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Events hosted</th>
                <th>Events participated</th>
                <th>Insights</th>
                <th>Remarks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 16 }}>
                    Nothing logged for this day yet.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.eventsHosted}</td>
                    <td>{e.eventsParticipated}</td>
                    <td>{e.insights}</td>
                    <td className="muted">{e.remarks ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="lnk" onClick={() => setEditing(e)}>
                          Edit
                        </button>
                        <button
                          className="lnk"
                          style={{ color: 'var(--danger, #c0392b)' }}
                          onClick={() => removeLog.mutate(e.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <ActivityFormModal mode="create" date={selected} onClose={() => setAddOpen(false)} />
      )}
      {editing && (
        <ActivityFormModal
          mode="edit"
          date={editing.date}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function ActivityFormModal({
  mode,
  date,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit';
  date: string;
  initial?: ConsultantLogRow;
  onClose: () => void;
}) {
  const create = useCreateConsultantLog();
  const update = useUpdateConsultantLog();
  const mutation = mode === 'edit' ? update : create;

  const [form, setForm] = useState(() => ({
    date: initial?.date ?? date,
    eventsHosted: String(initial?.eventsHosted ?? 0),
    eventsParticipated: String(initial?.eventsParticipated ?? 0),
    insights: String(initial?.insights ?? 0),
    remarks: initial?.remarks ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    if (!form.date) {
      setError('Date is required');
      return;
    }
    setError(null);
    const input: ConsultantLogInput = {
      date: form.date,
      eventsHosted: Number(form.eventsHosted) || 0,
      eventsParticipated: Number(form.eventsParticipated) || 0,
      insights: Number(form.insights) || 0,
      remarks: form.remarks.trim() || undefined,
    };
    const onSettled = {
      onSuccess: onClose,
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not save this entry'),
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
      aria-label={mode === 'edit' ? 'Edit activity entry' : 'Add activity entry'}
      onClick={onClose}
      style={overlay}
    >
      <div
        className="card pad"
        style={{ width: 480, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>
          {mode === 'edit' ? 'Edit activity entry' : 'Add activity entry'}
        </SectionTitle>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="pal-date">Date</label>
            <input
              id="pal-date"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pal-hosted">Events hosted</label>
            <input
              id="pal-hosted"
              type="number"
              min={0}
              value={form.eventsHosted}
              onChange={(e) => set('eventsHosted', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pal-participated">Events participated</label>
            <input
              id="pal-participated"
              type="number"
              min={0}
              value={form.eventsParticipated}
              onChange={(e) => set('eventsParticipated', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pal-insights">Insights</label>
            <input
              id="pal-insights"
              type="number"
              min={0}
              value={form.insights}
              onChange={(e) => set('insights', e.target.value)}
            />
          </div>
          <div className="field full">
            <label htmlFor="pal-remarks">Remarks</label>
            <textarea
              id="pal-remarks"
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              rows={3}
              placeholder="Anything worth noting about the day"
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
            {mutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save entry'}
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
