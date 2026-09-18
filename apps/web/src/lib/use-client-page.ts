import { useMemo } from 'react';

import { PAGE_SIZES } from '@/lib/use-list-params';

/**
 * Paging for a list that is already fully in the browser (a small, bounded config list). Returns
 * the visible slice and the props `DataTable`'s `pagination` expects; the requested page is clamped
 * so a filter that shrinks the list never leaves you on an empty page.
 */
export function useClientPage<T>(
  rows: T[],
  state: { page: number; pageSize: number },
  update: (patch: { page?: number; pageSize?: number }) => void,
) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((page - 1) * state.pageSize, page * state.pageSize),
    [rows, page, state.pageSize],
  );
  return {
    pageRows,
    pagination: {
      page,
      pageSize: state.pageSize,
      total,
      pageSizeOptions: PAGE_SIZES,
      onPageChange: (p: number) => update({ page: p }),
      onPageSizeChange: (s: number) => update({ pageSize: s }),
    },
  };
}
