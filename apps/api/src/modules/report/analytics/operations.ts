import { sql, type SQL } from 'drizzle-orm';

import { foldDays, inCategories, inScope, int, localDay, num, ratio, within } from './sql';
import {
  DETAIL_LIMIT,
  type AnalyticCtx,
  type AnalyticDef,
  type BreakdownRows,
  type DayRange,
  type Measure,
} from './types';

/**
 * Operations — the work at the counter. A pick-up is counted on the day and at the branch where the
 * keys were handed over, a return where the car came back. A return is "late" when it came back
 * more than one hour after the time on the agreement. Damage is what inspections found at return
 * and what was charged for it.
 */
const LATE = sql`(rt.returned_at > rt.scheduled_return_at + interval '1 hour')`;
const columns = [
  { key: 'pickups', format: 'count', share: true, additive: true },
  { key: 'returns', format: 'count', additive: true },
  { key: 'late_returns', format: 'count', additive: true },
  { key: 'late_rate', format: 'percent' },
  { key: 'damage_minor', format: 'money', additive: true },
] as const;

export const operations: AnalyticDef = {
  code: 'operations',
  usesBasis: false,
  kpis: [
    { key: 'pickups', format: 'count', betterWhen: 'neutral' },
    { key: 'returns', format: 'count', betterWhen: 'neutral' },
    { key: 'on_time_rate', format: 'percent', betterWhen: 'up' },
    { key: 'late_returns', format: 'count', betterWhen: 'down' },
    { key: 'avg_late_hours', format: 'hours', betterWhen: 'down' },
    { key: 'overdue_now', format: 'count', betterWhen: 'down', snapshot: true },
    { key: 'extensions', format: 'count', betterWhen: 'neutral' },
    { key: 'no_shows', format: 'count', betterWhen: 'down' },
    { key: 'issue_rate', format: 'percent', betterWhen: 'down' },
    { key: 'findings', format: 'count', betterWhen: 'down' },
    { key: 'damage_minor', format: 'money', betterWhen: 'down' },
    { key: 'settlement_minor', format: 'money', betterWhen: 'neutral' },
    { key: 'avg_distance_km', format: 'km', betterWhen: 'neutral' },
  ],
  series: [
    { key: 'pickups', format: 'count' },
    { key: 'returns', format: 'count' },
  ],
  breakdowns: [
    { key: 'location', columns: [...columns] },
    { key: 'category', columns: [...columns] },
  ],
  notes: ['operations.counted', 'operations.late', 'operations.damage', 'operations.settlement'],
  currencyActivity: async (ctx, range) => {
    const rows = await ctx.db.execute<{ currency: string; n: number }>(sql`
      select rt.currency, count(*)::int as n from rental rt
      where rt.organization_id = ${ctx.orgId}
        and (${within(sql`rt.picked_up_at`, ctx, range)} or ${within(sql`rt.returned_at`, ctx, range)})
        and (${inScope(sql`rt.pickup_location_code`, ctx.scope)} or ${inScope(sql`rt.return_location_code`, ctx.scope)})
      group by rt.currency order by n desc, rt.currency`);
    return rows.map((r) => ({ currency: r.currency, count: Number(r.n) }));
  },
  measure: (ctx, range, buckets, opts) => measureOperations(ctx, range, buckets, opts.detail),
};

/** rentals with their vehicle's category; aliases rt, u, c */
const RENTALS = sql`from rental rt
  left join vehicle_unit u on u.id = rt.unit_id
  left join vehicle_category c on c.id = u.category_id`;
const cat = (ctx: AnalyticCtx): SQL => inCategories(sql`c.code`, ctx.categories);

async function measureOperations(
  ctx: AnalyticCtx,
  range: DayRange,
  buckets: Parameters<AnalyticDef['measure']>[2],
  detail: boolean,
): Promise<Measure> {
  const tz = ctx.period.timezone;
  const org = sql`rt.organization_id = ${ctx.orgId}`;
  const pick = sql`${org} and rt.picked_up_at is not null and ${within(sql`rt.picked_up_at`, ctx, range)}
    and ${inScope(sql`rt.pickup_location_code`, ctx.scope)} and ${cat(ctx)}`;
  const ret = sql`${org} and rt.returned_at is not null and ${within(sql`rt.returned_at`, ctx, range)}
    and ${inScope(sql`rt.return_location_code`, ctx.scope)} and ${cat(ctx)}`;

  const [p] = await ctx.db.execute<Record<string, unknown>>(
    sql`select count(*)::int as n ${RENTALS} where ${pick}`,
  );
  const [r] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n,
      count(*) filter (where ${LATE})::int as late,
      avg(extract(epoch from (rt.returned_at - rt.scheduled_return_at)) / 3600.0) filter (where ${LATE}) as late_h,
      coalesce(sum(rt.settlement_minor) filter (where rt.currency = ${ctx.currency}), 0) as settlement,
      avg(rt.odometer_in_km - rt.odometer_out_km)
        filter (where rt.odometer_in_km >= rt.odometer_out_km) as km
    ${RENTALS} where ${ret}`);
  const [ext] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n
    from rental_event e join rental rt on rt.id = e.rental_id
    left join vehicle_unit u on u.id = rt.unit_id
    left join vehicle_category c on c.id = u.category_id
    where ${org} and e.type = 'extended' and ${within(sql`e.created_at`, ctx, range)}
      and ${inScope(sql`rt.pickup_location_code`, ctx.scope)} and ${cat(ctx)}`);
  const [ns] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n from reservation r
    where r.organization_id = ${ctx.orgId} and r.state = 'no_show'
      and ${within(sql`r.pickup_at`, ctx, range)}
      and ${inScope(sql`r.pickup_location_code`, ctx.scope)}
      and ${inCategories(sql`r.category_code`, ctx.categories)}`);
  const [over] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n ${RENTALS}
    where ${org} and rt.state = 'overdue' and ${inScope(sql`rt.pickup_location_code`, ctx.scope)} and ${cat(ctx)}`);
  const [insp] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n, count(*) filter (where i.outcome = 'issues')::int as issues
    from inspection i join rental rt on rt.id = i.rental_id
    left join vehicle_unit u on u.id = rt.unit_id
    left join vehicle_category c on c.id = u.category_id
    where ${org} and i.kind = 'return' and ${within(sql`i.created_at`, ctx, range)}
      and ${inScope(sql`rt.return_location_code`, ctx.scope)} and ${cat(ctx)}`);
  const [dmg] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n,
      coalesce(sum(f.charge_minor) filter (where rt.currency = ${ctx.currency}), 0) as charged
    from inspection_finding f join inspection i on i.id = f.inspection_id
    join rental rt on rt.id = i.rental_id
    left join vehicle_unit u on u.id = rt.unit_id
    left join vehicle_category c on c.id = u.category_id
    where ${org} and ${within(sql`f.created_at`, ctx, range)}
      and ${inScope(sql`rt.return_location_code`, ctx.scope)} and ${cat(ctx)}`);

  const returns = num(r?.n);
  const late = num(r?.late);
  const kpis: Measure['kpis'] = {
    pickups: num(p?.n),
    returns,
    on_time_rate: returns ? 1 - late / returns : null,
    late_returns: late,
    avg_late_hours:
      r?.late_h === null || r?.late_h === undefined ? null : Math.round(num(r.late_h) * 10) / 10,
    overdue_now: num(over?.n),
    extensions: num(ext?.n),
    no_shows: num(ns?.n),
    issue_rate: ratio(num(insp?.issues), num(insp?.n)),
    findings: num(dmg?.n),
    damage_minor: int(dmg?.charged),
    settlement_minor: int(r?.settlement),
    avg_distance_km: r?.km === null || r?.km === undefined ? null : Math.round(num(r.km)),
  };

  const pickDays = await ctx.db.execute<Record<string, unknown>>(sql`
    select ${localDay(sql`rt.picked_up_at`, tz)} as day, count(*)::int as n ${RENTALS} where ${pick} group by 1`);
  const retDays = await ctx.db.execute<Record<string, unknown>>(sql`
    select ${localDay(sql`rt.returned_at`, tz)} as day, count(*)::int as n ${RENTALS} where ${ret} group by 1`);
  const series = foldDays(
    buckets,
    [
      ...pickDays.map((x) => ({ day: String(x.day), k: 'pickups', n: num(x.n) })),
      ...retDays.map((x) => ({ day: String(x.day), k: 'returns', n: num(x.n) })),
    ],
    ['pickups', 'returns'],
    (x, k) => (x.k === k ? x.n : 0),
  );

  /** pick-ups, returns, late returns and damage per location or per category */
  const group = async (
    pickKey: SQL,
    retKey: SQL,
    label: SQL,
    joins: (keyCol: SQL) => SQL,
    damageKey: SQL,
  ): Promise<BreakdownRows> => {
    const [a, b, d] = await Promise.all([
      ctx.db.execute<Record<string, unknown>>(sql`
        select ${pickKey} as key, ${label} as label, count(*)::int as n
        ${RENTALS} ${joins(pickKey)} where ${pick} group by 1`),
      ctx.db.execute<Record<string, unknown>>(sql`
        select ${retKey} as key, ${label} as label, count(*)::int as n,
          count(*) filter (where ${LATE})::int as late
        ${RENTALS} ${joins(retKey)} where ${ret} group by 1`),
      ctx.db.execute<Record<string, unknown>>(sql`
        select ${damageKey} as key, ${label} as label,
          coalesce(sum(f.charge_minor) filter (where rt.currency = ${ctx.currency}), 0) as charged
        from inspection_finding f join inspection i on i.id = f.inspection_id
        join rental rt on rt.id = i.rental_id
        left join vehicle_unit u on u.id = rt.unit_id
        left join vehicle_category c on c.id = u.category_id
        ${joins(damageKey)}
        where ${org} and ${within(sql`f.created_at`, ctx, range)}
          and ${inScope(sql`rt.return_location_code`, ctx.scope)} and ${cat(ctx)}
        group by 1`),
    ]);
    const rows = new Map<string, { label?: string; values: Record<string, number> }>();
    const row = (key: string, label: unknown) => {
      const e = rows.get(key) ?? {
        label: label ? String(label) : undefined,
        values: { pickups: 0, returns: 0, late_returns: 0, damage_minor: 0 },
      };
      rows.set(key, e);
      return e.values;
    };
    for (const x of a) row(String(x.key), x.label).pickups = num(x.n);
    for (const x of b) {
      const v = row(String(x.key), x.label);
      v.returns = num(x.n);
      v.late_returns = num(x.late);
    }
    for (const x of d) row(String(x.key), x.label).damage_minor = int(x.charged);
    return [...rows.entries()]
      .map(([key, e]) => ({
        key,
        label: e.label,
        values: {
          ...e.values,
          late_rate: ratio(e.values.late_returns!, e.values.returns!),
        } as Record<string, number | null>,
      }))
      .sort(
        (x, y) => (y.values.pickups ?? 0) - (x.values.pickups ?? 0) || x.key.localeCompare(y.key),
      );
  };

  const locJoin = (keyCol: SQL) =>
    sql`left join location l on l.organization_id = rt.organization_id and l.code = ${keyCol}`;
  const totals = { late_rate: ratio(late, returns) };
  const measure: Measure = {
    kpis,
    series,
    breakdowns: {
      location: {
        rows: await group(
          sql`rt.pickup_location_code`,
          sql`rt.return_location_code`,
          sql`max(l.name)`,
          locJoin,
          sql`rt.return_location_code`,
        ),
        totals,
      },
      category: {
        rows: await group(
          sql`coalesce(c.code, 'unassigned')`,
          sql`coalesce(c.code, 'unassigned')`,
          sql`max(c.display_name)`,
          () => sql``,
          sql`coalesce(c.code, 'unassigned')`,
        ),
        totals,
      },
    },
  };

  if (detail) {
    const where = sql`${org} and (${within(sql`rt.picked_up_at`, ctx, range)} or ${within(sql`rt.returned_at`, ctx, range)})
      and (${inScope(sql`rt.pickup_location_code`, ctx.scope)} or ${inScope(sql`rt.return_location_code`, ctx.scope)})
      and ${cat(ctx)}`;
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select rt.reference, rt.reservation_reference as reservation, u.plate, c.code as category,
        rt.pickup_location_code as pickup_location, rt.return_location_code as return_location,
        to_char(rt.picked_up_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as picked_up_at,
        to_char(rt.scheduled_return_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as due_back,
        to_char(rt.returned_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as returned_at,
        case when rt.returned_at is not null and ${LATE}
          then round((extract(epoch from (rt.returned_at - rt.scheduled_return_at)) / 3600.0)::numeric, 1)::float end as late_hours,
        case when rt.odometer_in_km >= rt.odometer_out_km then rt.odometer_in_km - rt.odometer_out_km end as distance_km,
        rt.settlement_minor, rt.currency
      ${RENTALS} where ${where}
      order by coalesce(rt.returned_at, rt.picked_up_at) desc, rt.reference
      limit ${DETAIL_LIMIT}`);
    const [count] = await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n ${RENTALS} where ${where}`,
    );
    measure.detail = {
      columns: [
        { key: 'reference', format: 'text' },
        { key: 'reservation', format: 'text' },
        { key: 'plate', format: 'text' },
        { key: 'category', format: 'text' },
        { key: 'pickup_location', format: 'text' },
        { key: 'return_location', format: 'text' },
        { key: 'picked_up_at', format: 'text' },
        { key: 'due_back', format: 'text' },
        { key: 'returned_at', format: 'text' },
        { key: 'late_hours', format: 'hours' },
        { key: 'distance_km', format: 'km' },
        { key: 'settlement_minor', format: 'money' },
      ],
      rows: rows.map((x) => ({ ...x })),
      total: num(count?.n),
      truncated: num(count?.n) > rows.length,
    };
  }
  return measure;
}
