import { useMemo, useState } from 'react';

/**
 * Chip-based multi-select: pick zero or more values from a fixed `options` list (unlike
 * SearchableSelect, typing a value that isn't in the list does nothing — this is a strict
 * picker, used for things like "which PPG team members own this record").
 */
export function MultiSelect({
  id,
  values,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = options.filter((o) => !values.includes(o));
    return (q ? available.filter((o) => o.toLowerCase().includes(q)) : available).slice(0, 20);
  }, [query, options, values]);

  function add(v: string) {
    if (!values.includes(v)) onChange([...values, v]);
    setQuery('');
    setOpen(false);
  }
  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div className="combo-wrap">
      <div className="ms-box">
        {values.map((v) => (
          <span className="ms-chip" key={v}>
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          style={{ border: 'none', flex: 1, minWidth: 120 }}
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && filtered.length) {
              e.preventDefault();
              add(filtered[0]);
            }
          }}
          placeholder={values.length === 0 ? placeholder : ''}
        />
      </div>
      {open && (
        <div className="combo-menu">
          {filtered.length === 0 ? (
            <div className="combo-empty">No more PPG team members to add</div>
          ) : (
            filtered.map((o) => (
              // mousedown (not click) fires before the input's blur, so preventDefault
              // here stops the blur from closing the menu before the pick registers.
              <div
                key={o}
                className="combo-opt"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o);
                }}
              >
                {o}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
