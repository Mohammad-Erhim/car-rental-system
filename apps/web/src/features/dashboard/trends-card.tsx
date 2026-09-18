import { useI18n } from '@carrental/i18n/react';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDashboardAnalytics } from '@/lib/admin-hooks';
import { formatMinor } from '@/lib/discovery-hooks';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

// Theme tokens, never literal colours — resolved as CSS custom properties so the charts repaint
// on a light/dark/brand switch without any JS involvement.
const COLOR = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
};
const CHART_MARGIN = { top: 4, right: 8, left: 8, bottom: 0 };

function ChartBlock({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {legend}
      </div>
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Recharts' default tooltip ignores CSS tokens — render our own so it follows the theme. */
function themedTooltip(format: (v: number) => string, label: string) {
  return function TooltipContent({
    active,
    payload,
    label: x,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ value?: unknown }>;
    label?: unknown;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="font-medium">{String(x)}</p>
        <p className="text-muted-foreground">
          {label}:{' '}
          <span className="font-semibold text-foreground">
            {format(Number(payload[0]?.value ?? 0))}
          </span>
        </p>
      </div>
    );
  };
}

/**
 * Trend charts. One range selector drives all four so "why does revenue differ from bookings" is
 * never two charts silently covering different windows.
 */
export function TrendsCard({ locationCode }: { locationCode?: string }) {
  const { t, fmt } = useI18n();
  const [days, setDays] = useState<Range>(30);
  const analytics = useDashboardAnalytics(days, locationCode);
  const a = analytics.data;

  const money = (minor: number) => formatMinor(minor, a?.currency ?? 'USD');
  // `dateStyle` must be explicitly cleared — Intl.DateTimeFormat throws if it's combined with
  // component options like `month`/`day`, and fmt.date() defaults it to 'medium'
  const tick = (iso: string) =>
    fmt.date(iso, { dateStyle: undefined, month: 'short', day: 'numeric' });
  const xAxis = (
    <XAxis
      dataKey="date"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      tick={{ fill: COLOR.muted, fontSize: 11 }}
      tickFormatter={tick}
    />
  );

  return (
    <SectionCard
      title={t('ops.dash.analytics.title')}
      icon={TrendingUp}
      description={
        a
          ? `${a.scopeNote} · ${t('ops.dash.analytics.utilCaveat', { n: a.fleetTotal })}`
          : undefined
      }
      actions={
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as Range)}>
          <TabsList aria-label={t('ops.dash.analytics.range')}>
            {RANGES.map((n) => (
              <TabsTrigger key={n} value={String(n)} data-testid={`ops-dash-range-${n}`}>
                {t('ops.dash.analytics.days', { n })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {analytics.isLoading ? (
        <div className="grid gap-8 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[15rem]" />
          ))}
        </div>
      ) : analytics.isError || !a ? (
        <StateView
          kind="error"
          title={t('state.failure.title')}
          description={t('ops.dash.analytics.loadError')}
          actionLabel={t('action.retry')}
          onAction={() => void analytics.refetch()}
        />
      ) : (
        <div
          className="grid gap-x-8 gap-y-8 lg:grid-cols-2"
          data-testid="ops-dash-analytics-charts"
        >
          <ChartBlock title={t('ops.dash.analytics.revenue')}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={a.daily} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLOR.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={COLOR.border} strokeDasharray="3 3" />
                {xAxis}
                <YAxis hide />
                <Tooltip
                  content={themedTooltip(money, t('ops.dash.analytics.revenue'))}
                  cursor={{ stroke: COLOR.border }}
                />
                <Area
                  type="monotone"
                  dataKey="revenueMinor"
                  stroke={COLOR.primary}
                  strokeWidth={2}
                  fill="url(#dashRevenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title={t('ops.dash.analytics.utilization')}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={a.daily} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke={COLOR.border} strokeDasharray="3 3" />
                {xAxis}
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  content={themedTooltip((v) => `${v}%`, t('ops.dash.analytics.utilization'))}
                  cursor={{ stroke: COLOR.border }}
                />
                <Line
                  type="monotone"
                  dataKey="utilizationPct"
                  stroke={COLOR.success}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock
            title={t('ops.dash.analytics.bookings')}
            legend={
              <div className="flex gap-3">
                <LegendDot color={COLOR.primary} label={t('ops.dash.analytics.bookings')} />
                <LegendDot color={COLOR.destructive} label={t('ops.dash.cancellations')} />
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={a.daily} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke={COLOR.border} strokeDasharray="3 3" />
                {xAxis}
                <YAxis hide />
                <Tooltip
                  content={themedTooltip((v) => fmt.number(v), t('ops.dash.analytics.bookings'))}
                  cursor={{ fill: COLOR.border, fillOpacity: 0.3 }}
                />
                <Bar dataKey="bookings" fill={COLOR.primary} radius={[3, 3, 0, 0]} />
                <Bar dataKey="cancellations" fill={COLOR.destructive} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title={t('ops.dash.analytics.byCategory')}>
            {a.byCategory.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={a.byCategory}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={COLOR.border} strokeDasharray="3 3" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="categoryCode"
                    tickLine={false}
                    axisLine={false}
                    width={90}
                    tick={{ fill: COLOR.muted, fontSize: 12 }}
                  />
                  <Tooltip
                    content={themedTooltip(money, t('ops.dash.analytics.revenue'))}
                    cursor={{ fill: COLOR.border, fillOpacity: 0.3 }}
                  />
                  <Bar dataKey="revenueMinor" fill={COLOR.primary} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <StateView
                title={t('ops.dash.analytics.empty')}
                className="h-[200px] py-0"
                data-testid="ops-dash-analytics-no-category"
              />
            )}
          </ChartBlock>
        </div>
      )}
    </SectionCard>
  );
}
