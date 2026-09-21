import type {
  AnalyticReport,
  ReportBreakdown,
  ReportKpi,
  ReportParams,
  ReportSeries,
} from '@carrental/contracts';
import { sql } from 'drizzle-orm';

import { bookings } from './bookings';
import { fleet } from './fleet';
import { operations } from './operations';
import { overview } from './overview';
import { payments } from './payments';
import { buckets as makeBuckets, resolvePeriod, reportTimezone } from './period';
import { sales } from './sales';
import type { AnalyticCtx, AnalyticDef, DayRange, Measure } from './types';

export const ANALYTICS: Record<string, AnalyticDef> = {
  overview,
  sales,
  bookings,
  fleet,
  payments,
  operations,
};
export const isAnalytic = (queryKind: string) => queryKind.startsWith('analytic:');
export const analyticDef = (queryKind: string): AnalyticDef | undefined =>
  ANALYTICS[queryKind.replace('analytic:', '')];

export interface EngineInput {
  db: AnalyticCtx['db'];
  orgId: string;
  scope: string[] | null;
  params: ReportParams;
  title: string;
  /** the currency the organisation trades in — shown when it has activity, else the busiest one */
  defaultCurrency: string;
  now: Date;
}

/** The zone the days are cut in: the scope's branches' zone (most common one when several). */
async function zoneFor(db: EngineInput['db'], orgId: string, scope: string[] | null) {
  const rows = await db.execute<{ timezone: string }>(sql`
    select timezone from location
    where organization_id = ${orgId} and status <> 'archived'
      ${
        scope?.length
          ? sql`and code in (${sql.join(
              scope.map((c) => sql`${c}`),
              sql`, `,
            )})`
          : sql``
      }`);
  return reportTimezone(rows.map((r) => r.timezone));
}

/** Runs one analytic report: the period, its comparison, and everything merged into one result. */
export async function runAnalytic(def: AnalyticDef, input: EngineInput): Promise<AnalyticReport> {
  const { params } = input;
  const timezone = await zoneFor(input.db, input.orgId, input.scope);
  const period = resolvePeriod(params, timezone, input.now);
  const base = {
    db: input.db,
    orgId: input.orgId,
    scope: input.scope,
    categories: params.categoryCodes?.length ? params.categoryCodes : null,
    period,
    now: input.now,
  };
  const range: DayRange = { from: period.from, to: period.to };
  const compareRange: DayRange | null = period.compare
    ? { from: period.compare.from, to: period.compare.to }
    : null;

  // which currency: the one asked for, else the organisation's if it sold anything, else the busiest
  const activity = await def.currencyActivity(base, range);
  const prior = compareRange ? await def.currencyActivity(base, compareRange) : [];
  const seen = new Map<string, number>();
  for (const a of [...activity, ...prior])
    seen.set(a.currency, (seen.get(a.currency) ?? 0) + a.count);
  const currencies = [...seen.keys()].sort();
  const chosen =
    params.currency ??
    (seen.has(input.defaultCurrency)
      ? input.defaultCurrency
      : (activity[0]?.currency ?? input.defaultCurrency));
  const ctx: AnalyticCtx = { ...base, currency: chosen };
  const otherCurrencies = activity.filter((a) => a.currency !== chosen);

  const buckets = makeBuckets(range.from, range.to, period.granularity);
  const previousBuckets = compareRange
    ? makeBuckets(compareRange.from, compareRange.to, period.granularity)
    : [];
  const [current, previous] = await Promise.all([
    def.measure(ctx, range, buckets, { detail: true }),
    compareRange
      ? def.measure(ctx, compareRange, previousBuckets, { detail: false })
      : Promise.resolve(null),
  ]);

  const kpis: ReportKpi[] = def.kpis.map((s) => ({
    key: s.key,
    format: s.format,
    value: current.kpis[s.key] ?? null,
    previous: s.snapshot ? null : (previous?.kpis[s.key] ?? null),
    betterWhen: s.betterWhen,
    ...(s.snapshot ? { snapshot: true } : {}),
  }));

  let series: ReportSeries | null = null;
  if (def.series) {
    series = {
      granularity: period.granularity,
      measures: def.series,
      points: buckets.map((b, i) => ({
        start: b.start,
        values: current.series[i] ?? {},
        ...(previous && previousBuckets[i]
          ? { previous: previous.series[i] ?? {}, previousStart: previousBuckets[i]!.start }
          : {}),
      })),
    };
  }

  const breakdowns: ReportBreakdown[] = def.breakdowns.map((spec) => {
    const cur = current.breakdowns[spec.key] ?? { rows: [] };
    const prev = spec.snapshot ? null : (previous?.breakdowns[spec.key] ?? null);
    const prevByKey = new Map(prev?.rows.map((r) => [r.key, r]));
    const rows = cur.rows.map((r) => ({
      ...r,
      ...(prev
        ? { previous: prevByKey.get(r.key)?.values ?? zeros(spec.columns.map((c) => c.key)) }
        : {}),
    }));
    const totals: Record<string, number | null> = { ...(cur.totals ?? {}) };
    for (const c of spec.columns.filter((c) => c.additive))
      totals[c.key] = rows.reduce((n, r) => n + (r.values[c.key] ?? 0), 0);
    return {
      key: spec.key,
      columns: spec.columns,
      rows,
      totals,
      ...(spec.snapshot ? { snapshot: true } : {}),
    };
  });

  const cats = await input.db.execute<{ code: string; name: string }>(sql`
    select code, display_name as name from vehicle_category
    where organization_id = ${input.orgId} and is_active order by sort_order, display_name`);

  return {
    code: def.code,
    title: input.title,
    period,
    currency: chosen,
    currencies,
    otherCurrencies,
    scope: { locations: input.scope, categories: base.categories },
    categories: cats.map((c) => ({ code: c.code, name: c.name })),
    generatedAt: input.now.toISOString(),
    kpis,
    series,
    breakdowns,
    detail: current.detail ?? null,
    notes: [...def.notes, 'common.timezone', 'common.change'],
  };
}

const zeros = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 0]));
export type { Measure };
