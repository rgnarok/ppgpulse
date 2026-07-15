import type { ScopedConsultant } from '../lib/types';
import type { PeriodParams } from '../lib/hooks';

export interface FilterState extends PeriodParams {
  consultantId: string; // '' = team overview
}

export function FilterBar({
  state,
  onChange,
  consultants,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  consultants: ScopedConsultant[];
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...state, ...patch });
  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="filterbar">
        <div className="field">
          <label htmlFor="f-consultant">Consultant</label>
          <select
            id="f-consultant"
            value={state.consultantId}
            onChange={(e) => set({ consultantId: e.target.value })}
          >
            <option value="">— Team overview —</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-fy">FY</label>
          <select
            id="f-fy"
            value={state.fy ?? ''}
            onChange={(e) => set({ fy: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="2025">FY 2025-26</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-month">Month</label>
          <input
            id="f-month"
            type="month"
            value={state.month ?? ''}
            onChange={(e) =>
              set({ month: e.target.value || undefined, from: undefined, to: undefined })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="f-from">From</label>
          <input
            id="f-from"
            type="date"
            value={state.from ?? ''}
            onChange={(e) => set({ from: e.target.value || undefined, month: undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-to">To</label>
          <input
            id="f-to"
            type="date"
            value={state.to ?? ''}
            onChange={(e) => set({ to: e.target.value || undefined, month: undefined })}
          />
        </div>
        <button
          type="button"
          className="btn btn-gho"
          onClick={() => onChange({ consultantId: '' })}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
