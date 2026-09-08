import { Fragment, type ReactNode } from 'react';

import { cn } from '../lib/utils';

import { AppStateView } from './app-state-view';

export interface DataTableColumn<T> {
  /** stable key — also the `data-col` on the cell */
  key: string;
  /** column header (already localised by the caller) */
  header: ReactNode;
  /** cell renderer */
  cell: (row: T) => ReactNode;
  /** extra classes on the `<td>` (e.g. `text-end`, `font-mono`) */
  className?: string;
  /** `<th>` scope helper — defaults to `col` */
  headClassName?: string;
}

export interface DataTableLabels {
  loading: string;
  loadFailTitle: string;
  retry: string;
  empty: string;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[] | undefined;
  /** stable key per row; `index` is there for positional data with no natural id */
  rowKey: (row: T, index: number) => string;
  /** react-query-ish status; pass what you have */
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  labels: DataTableLabels;
  /** stable locator for the `<table>` (SRS-UI-011) */
  testid?: string;
  /** locator for `<tbody>` — defaults to `${testid}-rows` */
  bodyTestid?: string;
  /** per-row `data-*` / className, e.g. `(r) => ({ 'data-code': r.code })` */
  rowProps?: (row: T) => Record<string, string | undefined>;
  /** extra classes on every `<tr>` (kept alongside the built-in `border-t`) */
  rowClassName?: string;
  /**
   * Optional full-width detail row rendered directly under a row. Return `null` for rows that
   * have nothing to expand; the caller owns the open/closed state. The returned node is placed
   * in a single `<td colSpan>` spanning every column and should bring its own padding.
   */
  renderSubRow?: (row: T) => ReactNode;
  /** min width before the table scrolls inside its own box (design §2.4) */
  minWidth?: string;
  className?: string;
  /** a visually-hidden `<caption>` for screen readers */
  caption?: string;
}

/**
 * The shared operations list table (STAGE-012). One implementation of the
 * loading / error / empty / table state machine + the scroll-in-box, uppercase-muted-header,
 * bordered-row markup every `/ops` screen was repeating. Labels come in already localised.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  isError,
  onRetry,
  labels,
  testid,
  bodyTestid,
  rowProps,
  rowClassName,
  renderSubRow,
  minWidth = '40rem',
  className,
  caption,
}: DataTableProps<T>) {
  if (isLoading) return <AppStateView kind="loading" inline title={labels.loading} />;
  if (isError) {
    return (
      <AppStateView
        kind="failure"
        inline
        title={labels.loadFailTitle}
        primaryAction={onRetry ? { label: labels.retry, onClick: onRetry } : undefined}
      />
    );
  }
  if (!rows || rows.length === 0) {
    return <AppStateView kind="no-results" inline title={labels.empty} />;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm" style={{ minWidth }} data-testid={testid}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="text-start text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('py-1 text-start font-medium', c.headClassName)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody data-testid={bodyTestid ?? (testid ? `${testid}-rows` : undefined)}>
          {rows.map((row, index) => {
            const extra = rowProps?.(row) ?? {};
            const sub = renderSubRow?.(row);
            return (
              <Fragment key={rowKey(row, index)}>
                <tr className={cn('border-t', rowClassName)} {...extra}>
                  {columns.map((c) => (
                    <td key={c.key} data-col={c.key} className={cn('py-2 pe-2', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
                {sub ? (
                  <tr data-subrow="">
                    <td colSpan={columns.length}>{sub}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
