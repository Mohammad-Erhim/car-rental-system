import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Button, Card, CardContent, CardHeader, CardTitle } from '@carrental/ui';
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

import { useDashboardAnalytics } from '../../lib/admin-hooks.js';
import { formatMinor } from '../../lib/discovery-hooks.js';

const RANGE_OPTIONS = [7, 30, 90] as const;

// theme tokens (packages/theme), never literal colours — resolved as CSS custom properties so
// the charts repaint correctly on a light/dark/brand-overlay switch without any JS involvement
const COLOR = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  mutedForeground: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
};

/** `payload.value` is the raw `YYYY-MM-DD` from the API — `formatTick` renders it through the
 *  locale's own date formatter (ar/fr get locale-correct month names and digit order) rather than
 *  a hardcoded `slice(5)` substring, which would show en-style "MM-DD" regardless of locale.
 *  Prop types are deliberately loose (`unknown`-ish) rather than importing recharts' own — its
 *  tick-content generics are stricter than this component actually needs. */
function ChartTick({
  x,
  y,
  payload,
  formatTick,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  formatTick: (iso: string) => string;
}) {
  return (
    <text x={x} y={y} dy={12} textAnchor="middle" fill={COLOR.mutedForeground} fontSize={11}>
      {payload?.value != null ? formatTick(String(payload.value)) : ''}
    </text>
  );
}

/** A themed tooltip content renderer — recharts' default tooltip ignores CSS tokens entirely, so
 *  left unstyled it renders with hardcoded white/black regardless of the active theme. */
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
    const value = Number(payload[0]?.value ?? 0);
    return (
      <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
        <p className="font-medium">{String(x)}</p>
        <p className="text-muted-foreground">
          {label}: <span className="font-medium text-foreground">{format(value)}</span>
        </p>
      </div>
    );
  };
}

/**
 * SCREEN-OPS-002 analytics — the trend view the point-in-time dashboard cards deliberately don't
 * have. Every chart shares the same day-range selector so "why does revenue look different from
 * bookings" is never a question of two charts silently covering different windows. Loading/error
 * states use the same `AppStateView` contract as the rest of the page, not a bespoke skeleton.
 */
export function OpsDashboardAnalytics({ locationCode }: { locationCode?: string }) {
  const { t, fmt } = useI18n();
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const analytics = useDashboardAnalytics(days, locationCode);
  const a = analytics.data;

  const money = (minor: number) => formatMinor(minor, a?.currency ?? 'USD');
  // `dateStyle` must be explicitly cleared — Intl.DateTimeFormat throws if it's combined with
  // component options like `month`/`day`, and fmt.date() defaults it to 'medium'
  const formatTick = (iso: string) =>
    fmt.date(iso, { dateStyle: undefined, month: 'short', day: 'numeric' });
  const renderTick = (props: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: unknown };
  }) => <ChartTick {...props} formatTick={formatTick} />;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <TrendingUp className="size-3.5" aria-hidden="true" />
            </span>
            {t('ops.dash.analytics.title')}
          </CardTitle>
          {a ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {a.scopeNote} · {t('ops.dash.analytics.utilCaveat', { n: a.fleetTotal })}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1.5" role="group" aria-label={t('ops.dash.analytics.range')}>
          {RANGE_OPTIONS.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? 'default' : 'outline'}
              onClick={() => setDays(n)}
              data-testid={`ops-dash-range-${n}`}
            >
              {t('ops.dash.analytics.days', { n })}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {analytics.isLoading ? (
          <AppStateView kind="loading" title={t('state.loading.title')} inline />
        ) : analytics.isError || !a ? (
          <AppStateView
            kind="failure"
            inline
            title={t('state.failure.title')}
            description={t('ops.dash.analytics.loadError')}
            primaryAction={{ label: t('action.retry'), onClick: () => analytics.refetch() }}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2" data-testid="ops-dash-analytics-charts">
            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.dash.analytics.revenue')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={a.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLOR.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={COLOR.border} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={renderTick} />
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
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.dash.analytics.utilization')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={a.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLOR.border} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={renderTick} />
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
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.dash.analytics.bookings')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={a.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLOR.border} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={renderTick} />
                  <YAxis hide />
                  <Tooltip
                    content={themedTooltip((v) => fmt.number(v), t('ops.dash.analytics.bookings'))}
                    cursor={{ fill: COLOR.border, fillOpacity: 0.3 }}
                  />
                  <Bar dataKey="bookings" fill={COLOR.primary} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cancellations" fill={COLOR.destructive} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: COLOR.primary }}
                  />
                  {t('ops.dash.analytics.bookings')}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: COLOR.destructive }}
                  />
                  {t('ops.dash.cancellations')}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.dash.analytics.byCategory')}</p>
              {a.byCategory.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={a.byCategory}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke={COLOR.border} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="categoryCode"
                      tickLine={false}
                      axisLine={false}
                      width={90}
                      tick={{ fill: COLOR.mutedForeground, fontSize: 12 }}
                    />
                    <Tooltip
                      content={themedTooltip(money, t('ops.dash.analytics.revenue'))}
                      cursor={{ fill: COLOR.border, fillOpacity: 0.3 }}
                    />
                    <Bar dataKey="revenueMinor" fill={COLOR.primary} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p
                  className="flex h-[200px] items-center justify-center text-sm text-muted-foreground"
                  data-testid="ops-dash-analytics-no-category"
                >
                  {t('ops.dash.analytics.empty')}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
