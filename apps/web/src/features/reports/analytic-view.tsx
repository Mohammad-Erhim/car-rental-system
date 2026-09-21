import type { AnalyticReport } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Info } from 'lucide-react';

import { BreakdownTable } from './breakdown-table';
import { DetailTable } from './detail-table';
import { KpiGrid } from './kpi-grid';
import { ReportHeader } from './report-header';
import { TrendChart } from './trend-chart';

import { ChoiceTabs } from '@/components/choice-tabs';
import { SectionCard } from '@/components/section-card';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** "All locations" or "Only Heathrow, Gatwick" */
export function scopeLabel(
  t: ReturnType<typeof useI18n>['t'],
  locations: string[] | null,
  nameOf: (code: string) => string,
): string {
  return locations?.length
    ? t('ops.rpt.scopeTo', { names: locations.map(nameOf).join(', ') })
    : t('ops.rpt.scopeAll');
}

/**
 * A finished analytic report, top to bottom: what it covers, the headline figures, the trend, the
 * breakdowns, the records behind them, and how the numbers are worked out. Used for the live report
 * and for a saved run alike — it only reads what the report carries.
 */
export function AnalyticView({
  report,
  usesBasis,
  nameOf,
  onCurrency,
}: {
  report: AnalyticReport;
  usesBasis: boolean;
  nameOf: (code: string) => string;
  /** switching currency is only offered on the live report */
  onCurrency?: (currency: string) => void;
}) {
  const { t, fmt } = useI18n();
  const compared = report.period.compare !== null;
  const categoryNames = (report.scope.categories ?? []).map(
    (c) => report.categories.find((x) => x.code === c)?.name ?? c,
  );
  // nothing happened: say so, instead of a page of zeros
  const quiet = report.kpis.filter((k) => !k.snapshot).every((k) => !k.value);
  const other = report.otherCurrencies.filter((o) => o.currency !== report.currency);
  return (
    <div className="space-y-6" data-testid="analytic-view">
      <ReportHeader
        report={report}
        scopeText={scopeLabel(t, report.scope.locations, nameOf)}
        categoryNames={categoryNames}
        usesBasis={usesBasis}
      />

      {report.currencies.length > 1 && onCurrency ? (
        <div className="space-y-2 print:hidden">
          <ChoiceTabs
            label={t('ops.rpt.f.currency')}
            value={report.currency ?? ''}
            onChange={onCurrency}
            testIdPrefix="rpt-currency"
            options={report.currencies.map((c) => ({ value: c, label: c }))}
          />
        </div>
      ) : null}
      {other.length ? (
        <Alert data-testid="report-other-currencies">
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>
            {t('ops.rpt.otherCurrencies', {
              list: other.map((o) => `${o.currency} (${o.count})`).join(', '),
              currency: report.currency ?? '',
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      {quiet ? (
        <Alert data-testid="report-quiet">
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>{t('ops.rpt.quiet')}</AlertDescription>
        </Alert>
      ) : null}

      <KpiGrid kpis={report.kpis} currency={report.currency} compared={compared} />

      {report.series ? (
        <SectionCard
          title={t('ops.rpt.trend')}
          description={t(`ops.rpt.trendBy.${report.series.granularity}`)}
        >
          <TrendChart series={report.series} currency={report.currency} compared={compared} />
        </SectionCard>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-2">
        {report.breakdowns.map((b) => (
          <BreakdownTable
            key={b.key}
            breakdown={b}
            currency={report.currency}
            compared={compared}
          />
        ))}
      </div>

      {report.detail ? (
        <DetailTable detail={report.detail} currency={report.currency} code={report.code} />
      ) : null}

      <p className="text-xs text-muted-foreground" data-testid="report-generated">
        {t('ops.rpt.generated', { when: fmt.dateTime(report.generatedAt) })}
      </p>

      {report.notes.length ? (
        <SectionCard title={t('ops.rpt.howCalculated')} data-testid="report-notes">
          <ul className="list-disc space-y-1.5 ps-5 text-sm text-muted-foreground">
            {report.notes.map((n) => (
              <li key={n}>{t(`ops.rpt.note.${n}`)}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
