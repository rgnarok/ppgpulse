/** Simple page-number + prev/next control, with a "Showing X–Y of Z" caption.
 * Renders nothing when everything fits on one page. */
export function Pagination({
  page,
  pageCount,
  pageSize,
  totalItems,
  onChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // A handful of page numbers around the current one, plus first/last, with ellipses.
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const numbers = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  return (
    <div className="pagination">
      <div className="muted" style={{ fontSize: 12.5 }}>
        Showing {start}–{end} of {totalItems}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-gho btn-sm"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          ‹ Prev
        </button>
        {numbers.map((n, i) => (
          <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && n - numbers[i - 1] > 1 && <span className="muted">…</span>}
            <button
              type="button"
              className={`btn btn-sm ${n === page ? 'btn-pri' : 'btn-gho'}`}
              onClick={() => onChange(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          </span>
        ))}
        <button
          type="button"
          className="btn btn-gho btn-sm"
          disabled={page === pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
