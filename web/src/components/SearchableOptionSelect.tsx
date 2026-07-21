import { useMemo, useState } from 'react';

export interface SearchableOption {
  id: string;
  label: string;
}

/**
 * Search-as-you-type picker over an `{ id, label }` option list. Unlike SearchableSelect
 * (where the typed text itself is the value — used for free-text-friendly fields like
 * "Client"), this is a strict picker: the value/onChange contract is the option's `id`,
 * while the input searches and displays the `label`. Used where what's stored (e.g. an
 * HDIS jdId) and what's searched (e.g. "title — client (jdId)") differ.
 */
export function SearchableOptionSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  fallbackLabel,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  /** Shown as the initial input text when `value` doesn't match any option — e.g. an
   * interview whose picked requirement fell outside the current viewer's HDIS scope.
   * Display only; doesn't affect the value. */
  fallbackLabel?: string;
}) {
  const selectedLabel = useMemo(() => options.find((o) => o.id === value)?.label, [options, value]);
  const [query, setQuery] = useState(selectedLabel ?? fallbackLabel ?? '');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return base.slice(0, 20);
  }, [query, options]);

  function pick(o: SearchableOption) {
    onChange(o.id);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div className="combo-wrap">
      <input
        id={id}
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          // Snap back to the actual selection's label — the field should never show
          // typed text that doesn't correspond to what's actually selected.
          setQuery(options.find((o) => o.id === value)?.label ?? fallbackLabel ?? '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && filtered.length) {
            e.preventDefault();
            pick(filtered[0]);
          }
        }}
        placeholder={placeholder}
      />
      {open && (
        <div className="combo-menu">
          {value && (
            <div
              className="combo-opt muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
                setQuery('');
                setOpen(false);
              }}
            >
              — Clear selection
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="combo-empty">No matches</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.id}
                className="combo-opt"
                // mousedown (not click) fires before the input's blur, so preventDefault
                // here stops the blur from closing the menu before the pick registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
