import { useMemo, useState } from 'react';

/**
 * Free-text input with a filtered, click-to-pick dropdown of `options`. Typing a value
 * that isn't in the list is allowed (e.g. a brand-new client name) — this isn't a strict
 * enum picker, just a fast way to reuse an existing value.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 20);
  }, [value, options]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="combo-wrap">
      <input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
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
          {filtered.length === 0 ? (
            <div className="combo-empty">No matches — press Enter to use “{value || '…'}”</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o}
                className="combo-opt"
                // mousedown (not click) fires before the input's blur, so preventDefault
                // here stops the blur from closing the menu before the pick registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
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
