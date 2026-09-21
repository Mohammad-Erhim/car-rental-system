import type { ReportTable } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatValue, measureLabel } from './report-format';

import { paths } from '@/app/paths';
import { DataTable } from '@/components/data-table/data-table';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { humanize, labelFor } from '@/lib/labels';

type Row = Record<string, unknown>;

/** The records behind the figures, paged. Long lists are cut and say so. */
/** columns that name a record the person can open, by report */
const LINKS: Record<string, Record<string, 'reservation' | 'rental'>> = {
  sales: { reference: 'reservation' },
  bookings: { reference: 'reservation' },
  payments: { reference: 'reservation' },
  operations: { reference: 'rental', reservation: 'reservation' },
};

export function DetailTable({
  detail,
  currency,
  code,
}: {
  detail: ReportTable;
  currency: string | null;
  code: string;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [page, setPage] = useState({ page: 1, pageSize: 25 });

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      detail.columns.map((c) => ({
        id: c.key,
        header: measureLabel(i18n, c.key),
        meta: {
          className: ['money', 'count', 'decimal', 'percent', 'hours', 'km'].includes(c.format)
            ? 'text-end'
            : undefined,
        },
        cell: ({ row }) => {
          const v = row.original[c.key];
          const link = LINKS[code]?.[c.key];
          if (link && typeof v === 'string' && v)
            return (
              <Link
                to={link === 'rental' ? paths.rental(v) : paths.reservation(v)}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                <bdi>{v}</bdi>
              </Link>
            );
          // a text cell that is a known state/channel/type reads in words
          if (
            c.format === 'text' &&
            typeof v === 'string' &&
            ['state', 'channel', 'type', 'outcome', 'purpose', 'reason'].includes(c.key)
          )
            return labelFor(i18n, `ops.rpt.bv.${c.key}.${v}`, v || '—') || humanize(v);
          return (
            <span className="tabular-nums">
              {formatValue(
                i18n,
                c.format,
                v,
                String(row.original.currency ?? currency ?? '') || null,
              )}
            </span>
          );
        },
      })),
    // the language is the only thing that changes how a cell reads
    [detail.columns, i18n.locale, currency, code],
  );
  const start = (page.page - 1) * page.pageSize;
  const slice = detail.rows
    .slice(start, start + page.pageSize)
    .map((r, i) => ({ ...r, __i: start + i }));

  return (
    <SectionCard
      title={t('ops.rpt.detail')}
      description={
        detail.truncated
          ? t('ops.rpt.detailTruncated', { shown: detail.rows.length, total: detail.total })
          : t('ops.rpt.detailCount', { n: detail.total })
      }
      data-testid="report-detail"
    >
      <DataTable
        label={t('ops.rpt.detail')}
        columns={columns}
        data={slice}
        getRowId={(r) => String(r.__i)}
        bodyTestId="report-detail-rows"
        empty={<StateView title={t('ops.rpt.nothingHere')} className="py-10" />}
        renderCard={(r) => (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-sm">
            {detail.columns.map((c) => (
              <div
                key={c.key}
                className={c.key === 'reference' ? 'col-span-2 font-medium' : undefined}
              >
                <dt className="text-xs text-muted-foreground">{measureLabel(i18n, c.key)}</dt>
                <dd className="tabular-nums">
                  {LINKS[code]?.[c.key] && typeof r[c.key] === 'string' ? (
                    <Link
                      to={
                        LINKS[code]![c.key] === 'rental'
                          ? paths.rental(String(r[c.key]))
                          : paths.reservation(String(r[c.key]))
                      }
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <bdi>{String(r[c.key])}</bdi>
                    </Link>
                  ) : (
                    formatValue(
                      i18n,
                      c.format,
                      r[c.key],
                      String(r.currency ?? currency ?? '') || null,
                    )
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        pagination={{
          page: page.page,
          pageSize: page.pageSize,
          total: detail.rows.length,
          pageSizeOptions: [10, 25, 50, 100],
          onPageChange: (p) => setPage((s) => ({ ...s, page: p })),
          onPageSizeChange: (n) => setPage({ page: 1, pageSize: n }),
        }}
      />
    </SectionCard>
  );
}
