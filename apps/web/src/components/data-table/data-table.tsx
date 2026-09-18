import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { Pagination, type PaginationState } from './pagination';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Per-column layout hints, set through `meta` on a column definition. */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** extra classes for the header and body cells (widths, alignment) */
    className?: string;
  }
}

// full class names (not interpolated) so Tailwind can see them
const SHOW_TABLE_FROM = {
  md: 'hidden md:block',
  lg: 'hidden lg:block',
  xl: 'hidden xl:block',
} as const;
const HIDE_CARDS_FROM = { md: 'md:hidden', lg: 'lg:hidden', xl: 'xl:hidden' } as const;

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  /** first load — renders skeleton rows shaped like the table */
  loading?: boolean;
  /** a background refetch / page change — keeps the old rows, dimmed */
  fetching?: boolean;
  /** shown in place of the body when there are no rows and nothing is loading */
  empty?: ReactNode;
  /** shown in place of the body when the request failed */
  error?: ReactNode;
  onRowClick?: (row: T) => void;
  /**
   * Below `md` the table is replaced by this list of cards — a dense table doesn't survive a
   * phone. When omitted the table stays and scrolls horizontally.
   */
  renderCard?: (row: T) => ReactNode;
  /** the width at which the table replaces the cards (default `md`); use `xl` for wide tables */
  cardBreakpoint?: 'md' | 'lg' | 'xl';
  pagination?: PaginationState;
  /** accessible name for the table */
  label: string;
  /** test id for the `<tbody>` (e2e hook) */
  bodyTestId?: string;
  skeletonRows?: number;
  className?: string;
}

/**
 * Server-paginated data table: TanStack Table for the column model, shadcn primitives for the
 * markup. It owns presentation only — loading/empty/error/fetching states, the responsive card
 * fallback and the pagination footer — never the data fetching, so any list page can drive it.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  fetching,
  empty,
  error,
  onRowClick,
  renderCard,
  cardBreakpoint = 'md',
  pagination,
  label,
  bodyTestId,
  skeletonRows = 8,
  className,
}: DataTableProps<T>) {
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const showBody = !loading && !error && rows.length > 0;
  const placeholder = error ?? (!loading && rows.length === 0 ? empty : null);

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', className)}>
      <div
        aria-busy={loading || fetching || undefined}
        className={cn('transition-opacity', fetching && !loading && 'opacity-60')}
      >
        {/* table — `md` and up (always, when there is no card layout) */}
        <div className={cn(renderCard && SHOW_TABLE_FROM[cardBreakpoint])}>
          <Table aria-label={label} className="min-w-[40rem]">
            <TableHeader className="bg-muted/40">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className={h.column.columnDef.meta?.className}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody data-testid={bodyTestId}>
              {loading
                ? Array.from({ length: skeletonRows }, (_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {columns.map((_c, ci) => (
                        <TableCell key={ci}>
                          <Skeleton className="h-5 w-full max-w-[9rem]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : showBody
                  ? rows.map((row) => (
                      <TableRow
                        key={row.id}
                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                        className={cn(onRowClick && 'cursor-pointer')}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cell.column.columnDef.meta?.className}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : null}
            </TableBody>
          </Table>
        </div>

        {/* cards — below `md` */}
        {renderCard ? (
          <ul className={cn('divide-y', HIDE_CARDS_FROM[cardBreakpoint])}>
            {loading
              ? Array.from({ length: Math.min(skeletonRows, 5) }, (_, i) => (
                  <li key={i} className="space-y-2 p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </li>
                ))
              : showBody
                ? rows.map((row) => <li key={row.id}>{renderCard(row.original)}</li>)
                : null}
          </ul>
        ) : null}

        {placeholder}
      </div>

      {pagination && !error && !loading && rows.length > 0 ? <Pagination {...pagination} /> : null}
    </div>
  );
}
