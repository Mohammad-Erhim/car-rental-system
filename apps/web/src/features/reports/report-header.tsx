import type { AnalyticReport } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Clock, Coins, GitCompareArrows, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/** "21 Sep 2026" or "1 – 30 Sep 2026", in the person's language */
export function periodText(
  fmt: ReturnType<typeof useI18n>['fmt'],
  from: string,
  to: string,
): string {
  const d = (iso: string) => new Date(`${iso}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  if (from === to) return fmt.date(d(from), opts);
  return `${fmt.date(d(from), opts)} – ${fmt.date(d(to), opts)}`;
}

/**
 * What the report is about, said once at the top so no number is ever read out of context: which
 * days, compared with which, which branches and categories, which date places a booking in the
 * period, which zone the days are cut in, which currency.
 */
export function ReportHeader({
  report,
  scopeText,
  categoryNames,
  usesBasis,
}: {
  report: AnalyticReport;
  scopeText: string;
  categoryNames: string[];
  usesBasis: boolean;
}) {
  const { t, fmt } = useI18n();
  const { period } = report;
  return (
    <div className="space-y-2" data-testid="report-header">
      <p className="text-2xl font-semibold" data-testid="report-period">
        <bdi>{periodText(fmt, period.from, period.to)}</bdi>
        <span className="ms-3 text-base font-normal text-muted-foreground">
          {t('ops.rpt.daysCount', { n: period.days })}
        </span>
      </p>
      {period.compare ? (
        <p
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
          data-testid="report-compare"
        >
          <GitCompareArrows className="size-4" aria-hidden="true" />
          {t('ops.rpt.comparedWith', {
            period: periodText(fmt, period.compare.from, period.compare.to),
            kind: t(`ops.rpt.compareKind.${period.compare.kind}`),
          })}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-2 text-xs">
        <li>
          <Badge variant="secondary" className="gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {scopeText}
          </Badge>
        </li>
        {categoryNames.length ? (
          <li>
            <Badge variant="secondary">{categoryNames.join(', ')}</Badge>
          </li>
        ) : null}
        {usesBasis ? (
          <li>
            <Badge variant="outline">{t(`ops.rpt.basisShort.${period.basis}`)}</Badge>
          </li>
        ) : null}
        <li>
          <Badge variant="outline" className="gap-1">
            <Clock className="size-3" aria-hidden="true" />
            <bdi>{period.timezone}</bdi>
          </Badge>
        </li>
        {report.currency ? (
          <li>
            <Badge variant="outline" className="gap-1">
              <Coins className="size-3" aria-hidden="true" />
              {report.currency}
            </Badge>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
