import type { ReportBreakdown } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';

import { changeOf, changeText, formatValue, measureLabel, rowLabel } from './report-format';

import { SectionCard } from '@/components/section-card';
import { cn } from '@/lib/utils';

/**
 * One way of cutting a report ("by vehicle category"): the rows, a bar showing each row's share of
 * the column that matters, and a total that is the sum of the rows — so the table always agrees with
 * the cards above it. On a phone every row becomes a small card, nothing scrolls sideways.
 */
export function BreakdownTable({
  breakdown,
  currency,
  compared,
}: {
  breakdown: ReportBreakdown;
  currency: string | null;
  compared: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { columns, rows, totals } = breakdown;
  const shareCol = columns.find((c) => c.share);
  const shareTotal = shareCol ? (totals[shareCol.key] ?? 0) : 0;
  const showChange = compared && !breakdown.snapshot && !!shareCol;
  const share = (v: number | null | undefined) =>
    shareTotal > 0 && v ? Math.max(0, Math.min(1, v / shareTotal)) : 0;

  const move = (r: (typeof rows)[number]) => {
    if (!showChange || !shareCol || !r.previous) return null;
    const c = changeOf({
      value: r.values[shareCol.key] ?? null,
      previous: r.previous[shareCol.key] ?? null,
      format: shareCol.format,
      betterWhen: 'neutral',
    });
    return c && c.direction !== 'flat' ? changeText(i18n, c) : null;
  };

  return (
    <SectionCard
      title={t(`ops.rpt.b.${breakdown.key}`)}
      description={breakdown.snapshot ? t('ops.rpt.snapshotNote') : undefined}
      data-testid={`breakdown-${breakdown.key}`}
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('ops.rpt.nothingHere')}</p>
      ) : (
        <>
          <div
            className="hidden overflow-x-auto md:block"
            tabIndex={0}
            role="region"
            aria-label={t(`ops.rpt.b.${breakdown.key}`)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {t(`ops.rpt.b1.${breakdown.key}`)}
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={cn(
                        'px-3 py-2 font-medium',
                        c.format === 'text' ? 'text-start' : 'text-end',
                      )}
                    >
                      {measureLabel(i18n, c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-medium">
                      <bdi>{rowLabel(i18n, breakdown.key, r)}</bdi>
                    </th>
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-end tabular-nums">
                        {c.share ? (
                          <span className="ms-auto flex min-w-36 flex-col items-end gap-1">
                            <span>
                              {formatValue(i18n, c.format, r.values[c.key], currency)}
                              {move(r) ? (
                                <span className="ms-2 text-xs text-muted-foreground">
                                  <bdi>{move(r)}</bdi>
                                </span>
                              ) : null}
                            </span>
                            <span className="flex w-full items-center gap-2">
                              <span
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                              >
                                <span
                                  className="block h-full rounded-full bg-primary"
                                  style={{ width: `${share(r.values[c.key]) * 100}%` }}
                                />
                              </span>
                              <span className="w-10 text-xs text-muted-foreground">
                                {i18n.fmt.percent(share(r.values[c.key]), {
                                  maximumFractionDigits: 0,
                                })}
                              </span>
                            </span>
                          </span>
                        ) : (
                          formatValue(i18n, c.format, r.values[c.key], currency)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <th scope="row" className="py-2 pe-3 text-start">
                    {t('ops.rpt.total')}
                  </th>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-end tabular-nums">
                      {formatValue(i18n, c.format, totals[c.key], currency)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="divide-y md:hidden">
            {rows.map((r) => (
              <li key={r.key} className="space-y-2 py-3">
                <p className="font-medium">
                  <bdi>{rowLabel(i18n, breakdown.key, r)}</bdi>
                </p>
                {shareCol ? (
                  <span
                    className="block h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${share(r.values[shareCol.key]) * 100}%` }}
                    />
                  </span>
                ) : null}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {columns.map((c) => (
                    <div key={c.key}>
                      <dt className="text-xs text-muted-foreground">{measureLabel(i18n, c.key)}</dt>
                      <dd className="tabular-nums">
                        {formatValue(i18n, c.format, r.values[c.key], currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
            <li className="space-y-1 py-3">
              <p className="font-semibold">{t('ops.rpt.total')}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-medium">
                {columns.map((c) => (
                  <div key={c.key}>
                    <dt className="text-xs font-normal text-muted-foreground">
                      {measureLabel(i18n, c.key)}
                    </dt>
                    <dd className="tabular-nums">
                      {formatValue(i18n, c.format, totals[c.key], currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          </ul>
        </>
      )}
    </SectionCard>
  );
}
