import { useI18n } from '@carrental/i18n/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface PaginationState {
  /** 1-based */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Page numbers to render: always the first and last page, a window around the current one, and
 * `null` for each collapsed gap — `[1, null, 4, 5, 6, null, 20]`.
 */
export function pageWindow(page: number, pageCount: number, siblings = 1): Array<number | null> {
  const keep = new Set([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p += 1)
    if (p >= 1 && p <= pageCount) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push(null);
    out.push(p);
  });
  return out;
}

/** Footer for a server-paginated list: range summary, rows-per-page, prev/next and page numbers. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationState & { className?: string }) {
  const { t, fmt } = useI18n();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={t('ops.pager.label')}
      className={cn(
        'flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? t('ops.pager.empty')
          : t('ops.pager.showing', {
              from: fmt.number(from),
              to: fmt.number(to),
              total: fmt.number(total),
            })}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 sm:justify-end">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span id="pager-rows-label">{t('ops.pager.rows')}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-9 w-[4.5rem]" aria-labelledby="pager-rows-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('ops.pager.prev')}
          >
            <ChevronLeft className="rtl:-scale-x-100" aria-hidden="true" />
          </Button>

          {/* page numbers from `sm`; on phones the "Page x of y" text is enough */}
          <ul className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pageCount).map((p, i) =>
              p === null ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </li>
              ) : (
                <li key={p}>
                  <Button
                    variant={p === page ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => onPageChange(p)}
                    aria-label={t('ops.pager.goTo', { page: p })}
                    aria-current={p === page ? 'page' : undefined}
                    className="tabular-nums"
                  >
                    {fmt.number(p)}
                  </Button>
                </li>
              ),
            )}
          </ul>
          <span className="px-2 text-sm tabular-nums text-muted-foreground sm:hidden">
            {t('ops.pager.pageOf', { page: fmt.number(page), pageCount: fmt.number(pageCount) })}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label={t('ops.pager.next')}
          >
            <ChevronRight className="rtl:-scale-x-100" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
