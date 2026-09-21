import type { ReportSeries } from '@carrental/contracts';
import { minorUnitDigits } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatValue, measureLabel } from './report-format';

import { ChoiceTabs } from '@/components/choice-tabs';
import { Button } from '@/components/ui/button';

// theme tokens, never literal colours: the chart repaints with the theme
const COLOR = {
  primary: 'hsl(var(--primary))',
  previous: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
};

/** "2026-09-21" as a Date at local noon, so no zone can move it to another day */
const day = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * The trend of one measure over the period, with the comparison period drawn beside it. One measure
 * at a time (chosen with tabs, never a dropdown) keeps the scale honest; every bar can also be read
 * as a table, for screen readers and for people who want the numbers.
 */
export function TrendChart({
  series,
  currency,
  compared,
}: {
  series: ReportSeries;
  currency: string | null;
  compared: boolean;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const [chosen, setChosen] = useState(series.measures[0]!.key);
  const [asTable, setAsTable] = useState(false);
  const measure = series.measures.find((m) => m.key === chosen) ?? series.measures[0]!;
  const money = (v: number) => formatValue(i18n, measure.format, v, currency);

  const tick = (iso: string) =>
    series.granularity === 'month'
      ? fmt.date(day(iso), { dateStyle: undefined, month: 'short', year: '2-digit' })
      : fmt.date(day(iso), { dateStyle: undefined, month: 'short', day: 'numeric' });
  const title = (iso: string) =>
    series.granularity === 'month'
      ? fmt.date(day(iso), { dateStyle: undefined, month: 'long', year: 'numeric' })
      : series.granularity === 'week'
        ? t('ops.rpt.weekOf', {
            date: fmt.date(day(iso), { dateStyle: undefined, month: 'short', day: 'numeric' }),
          })
        : fmt.date(day(iso), {
            dateStyle: undefined,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

  const data = useMemo(
    () =>
      series.points.map((p) => ({
        start: p.start,
        current: p.values[measure.key] ?? 0,
        previous: p.previous ? (p.previous[measure.key] ?? 0) : null,
        previousStart: p.previousStart,
      })),
    [series, measure.key],
  );
  const showPrevious = compared && data.some((d) => d.previous !== null);
  const peak = Math.max(0, ...data.map((d) => Math.max(d.current, d.previous ?? 0)));

  // compact axis numbers: 12K, 1.2M — money in major units, percentages as they are
  const axis = (v: number) =>
    measure.format === 'percent'
      ? fmt.percent(v, { maximumFractionDigits: 0 })
      : measure.format === 'money'
        ? fmt.number(v / 10 ** minorUnitDigits(currency ?? 'USD'), {
            notation: 'compact',
            maximumFractionDigits: 1,
          })
        : fmt.number(v, { notation: 'compact', maximumFractionDigits: 1 });

  const summary = t('ops.rpt.chartSummary', {
    measure: measureLabel(i18n, measure.key),
    n: data.length,
    peak: money(peak),
  });

  return (
    <div className="space-y-3" data-testid="report-trend">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {series.measures.length > 1 ? (
          <ChoiceTabs
            label={t('ops.rpt.chartMeasure')}
            value={measure.key}
            onChange={setChosen}
            testIdPrefix="trend-measure"
            options={series.measures.map((m) => ({
              value: m.key,
              label: measureLabel(i18n, m.key),
            }))}
          />
        ) : (
          <h3 className="text-sm font-medium">{measureLabel(i18n, measure.key)}</h3>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground print:hidden">
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: COLOR.primary }}
              aria-hidden="true"
            />
            {t('ops.rpt.thisPeriod')}
          </span>
          {showPrevious ? (
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 border-t-2 border-dashed"
                style={{ borderColor: COLOR.previous }}
                aria-hidden="true"
              />
              {t('ops.rpt.previousPeriod')}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAsTable((v) => !v)}
            data-testid="trend-as-table"
          >
            {asTable ? t('ops.rpt.showChart') : t('ops.rpt.showTable')}
          </Button>
        </div>
      </div>

      {asTable ? (
        <div
          className="max-h-80 overflow-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label={t('ops.rpt.trend')}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-start text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{t('ops.rpt.period')}</th>
                <th className="p-2 text-end font-medium">{t('ops.rpt.thisPeriod')}</th>
                {showPrevious ? (
                  <th className="p-2 text-end font-medium">{t('ops.rpt.previousPeriod')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.start} className="border-t">
                  <td className="p-2">{title(d.start)}</td>
                  <td className="p-2 text-end tabular-nums">{money(d.current)}</td>
                  {showPrevious ? (
                    <td className="p-2 text-end tabular-nums text-muted-foreground">
                      {d.previous === null ? '—' : money(d.previous)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLOR.border} strokeDasharray="3 3" />
              <XAxis
                dataKey="start"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tick={{ fill: COLOR.previous, fontSize: 11 }}
                tickFormatter={tick}
              />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                tick={{ fill: COLOR.previous, fontSize: 11 }}
                tickFormatter={axis}
                domain={
                  measure.format === 'percent'
                    ? [0, (max: number) => Math.min(1, Math.max(0.1, max * 1.15))]
                    : [0, 'auto']
                }
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]!.payload as (typeof data)[number];
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                      <p className="font-medium">{title(d.start)}</p>
                      <p>
                        {t('ops.rpt.thisPeriod')}:{' '}
                        <span className="font-semibold tabular-nums">{money(d.current)}</span>
                      </p>
                      {showPrevious && d.previous !== null ? (
                        <p className="text-muted-foreground">
                          {t('ops.rpt.previousPeriod')}
                          {d.previousStart ? ` (${title(d.previousStart)})` : ''}:{' '}
                          <span className="tabular-nums">{money(d.previous)}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="current"
                fill={COLOR.primary}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
              {showPrevious ? (
                <Line
                  dataKey="previous"
                  stroke={COLOR.previous}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
