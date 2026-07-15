import { useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 20;

/** Client-side pagination over an already-filtered array. Clamps back to the last
 * page (rather than showing an empty page) when the array shrinks — e.g. a filter
 * or search narrows the result set below the current page. */
export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [pageState, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageState, pageCount);
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);
  return { page, setPage, pageCount, pageItems, pageSize, totalItems: items.length };
}
