import type { ReportKpi } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { changeOf, changeText, formatValue, measureHint, measureLabel } from './report-format';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONE = {
  good: 'text-success',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

/**
 * The headline figures of a report. Each card: what it is, the figure, and how it moved against the
 * comparison — the colour says whether that is good or bad for the business, the arrow which way.
 */
export function KpiGrid({
  kpis,
  currency,
  compared,
  headline = 4,
}: {
  kpis: ReportKpi[];
  currency: string | null;
  compared: boolean;
  /** how many of the first cards are drawn larger */
  headline?: number;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-testid="report-kpis">
      {kpis.map((k, i) => {
        const change = compared && !k.snapshot ? changeOf(k) : null;
        const hint = measureHint(i18n, k.key);
        return (
          <li key={k.key} className={cn(i < headline ? 'col-span-1' : '')}>
            <Card className="h-full space-y-1.5 p-4" data-testid={`kpi-${k.key}`}>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {measureLabel(i18n, k.key)}
                {k.snapshot ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide">
                    {t('ops.rpt.rightNow')}
                  </span>
                ) : null}
              </p>
              <p
                className={cn('font-semibold tabular-nums', i < headline ? 'text-2xl' : 'text-xl')}
                data-testid={`kpi-${k.key}-value`}
              >
                {formatValue(i18n, k.format, k.value, currency)}
              </p>
              {compared && !k.snapshot ? (
                <p className="min-h-5 text-xs" data-testid={`kpi-${k.key}-change`}>
                  {change ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        TONE[change.tone],
                      )}
                    >
                      {change.direction === 'up' ? (
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      ) : change.direction === 'down' ? (
                        <ArrowDownRight className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Minus className="size-3.5" aria-hidden="true" />
                      )}
                      {change.direction === 'flat' ? (
                        <span className="font-normal">{t('ops.rpt.noChange')}</span>
                      ) : (
                        <>
                          <span className="bidi-isolate">{changeText(i18n, change)}</span>
                          <span className="font-normal text-muted-foreground">
                            {t('ops.rpt.wasValue', {
                              value: formatValue(i18n, k.format, k.previous, currency),
                            })}
                          </span>
                        </>
                      )}
                    </span>
                  ) : k.previous === null ? (
                    <span className="text-muted-foreground">{t('ops.rpt.noPrevious')}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('ops.rpt.wasValue', {
                        value: formatValue(i18n, k.format, k.previous, currency),
                      })}
                    </span>
                  )}
                </p>
              ) : null}
              {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
