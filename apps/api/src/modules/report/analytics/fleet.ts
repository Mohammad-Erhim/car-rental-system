import { sql, type SQL } from 'drizzle-orm';

import { bucketIndex, daysBetween } from './period';
import { inCategories, inScope, int, num, ratio } from './sql';
import {
  DETAIL_LIMIT,
  type AnalyticCtx,
  type AnalyticDef,
  type DayRange,
  type Measure,
} from './types';

/**
 * Fleet utilisation — how much of the fleet earned money. A vehicle is counted for every day it was
 * in the fleet (from the day it was acquired, until it is retired), minus the time it was blocked
 * for maintenance or damage; it is "rented" for the time between pick-up and return. So:
 *
 *   utilisation = rented days ÷ rentable days
 *   ADR         = earned revenue ÷ rented days
 *   RevPAC      = earned revenue ÷ rentable days  (= utilisation × ADR)
 *
 * Earned revenue is a trip's price (ex tax) spread over its days, so a trip that crosses month end
 * earns in both months. Vehicles belong to their home location. The fleet is the fleet as it is
 * now — the system does not keep a history of vehicles that have since been retired.
 */
const fleetColumns = [
  { key: 'fleet_size', format: 'decimal', additive: true },
  { key: 'rented_days', format: 'decimal', share: true, additive: true },
  { key: 'utilization', format: 'percent' },
  { key: 'earned_minor', format: 'money', additive: true },
  { key: 'adr_minor', format: 'money' },
  { key: 'revpac_minor', format: 'money' },
] as const;

export const fleet: AnalyticDef = {
  code: 'fleet',
  usesBasis: false,
  kpis: [
    { key: 'utilization', format: 'percent', betterWhen: 'up' },
    { key: 'rented_days', format: 'decimal', betterWhen: 'up' },
    { key: 'rentable_days', format: 'decimal', betterWhen: 'neutral' },
    { key: 'blocked_days', format: 'decimal', betterWhen: 'down' },
    { key: 'fleet_size', format: 'decimal', betterWhen: 'neutral' },
    { key: 'earned_minor', format: 'money', betterWhen: 'up' },
    { key: 'adr_minor', format: 'money', betterWhen: 'up' },
    { key: 'revpac_minor', format: 'money', betterWhen: 'up' },
  ],
  series: [
    { key: 'utilization', format: 'percent' },
    { key: 'rented_days', format: 'decimal' },
  ],
  breakdowns: [
    { key: 'category', columns: [...fleetColumns] },
    { key: 'location', columns: [...fleetColumns] },
    {
      key: 'vehicle_state',
      snapshot: true,
      columns: [{ key: 'vehicles', format: 'count', share: true, additive: true }],
    },
  ],
  notes: ['fleet.formula', 'fleet.blocked', 'fleet.earned', 'fleet.home', 'fleet.current'],
  // utilisation is not money; the earned revenue is in the currency of the trips
  currencyActivity: async (ctx, range) => {
    const rows = await ctx.db.execute<{ currency: string; n: number }>(sql`
      select rt.currency, count(*)::int as n from rental rt
      where rt.organization_id = ${ctx.orgId} and rt.picked_up_at is not null
        and rt.picked_up_at < ${endOf(ctx, range)} and coalesce(rt.returned_at, now()) >= ${startOf(ctx, range)}
        and (${inScope(sql`rt.pickup_location_code`, ctx.scope)})
      group by rt.currency order by n desc, rt.currency`);
    return rows.map((r) => ({ currency: r.currency, count: Number(r.n) }));
  },
  measure: (ctx, range, buckets, opts) => measureFleet(ctx, range, buckets, opts.detail),
};

const startOf = (ctx: Omit<AnalyticCtx, 'currency'>, r: DayRange) =>
  sql`((${r.from}::date)::timestamp at time zone ${ctx.period.timezone})`;
const endOf = (ctx: Omit<AnalyticCtx, 'currency'>, r: DayRange) =>
  sql`((${r.to}::date + 1)::timestamp at time zone ${ctx.period.timezone})`;

/** one row per (day, vehicle): its share of the day in the fleet, blocked, rented, and earned */
function base(ctx: AnalyticCtx, range: DayRange): SQL {
  const tz = ctx.period.timezone;
  const n = daysBetween(range.from, range.to);
  const cutoff = sql`(case when b.status = 'released' then b.updated_at else null end)`;
  return sql`
  with d as (
    select x.day, x.s, x.e_eff,
      extract(epoch from (x.e_eff - x.s)) / extract(epoch from (x.e - x.s)) as w
    from (
      select (${range.from}::date + g) as day,
        ((${range.from}::date + g)::timestamp at time zone ${tz}) as s,
        ((${range.from}::date + g + 1)::timestamp at time zone ${tz}) as e,
        least(((${range.from}::date + g + 1)::timestamp at time zone ${tz}), now()) as e_eff
      from generate_series(0, ${n - 1}::int) g
    ) x
    where x.e_eff > x.s
  ),
  u as (
    select vu.id, vu.plate, vu.make, vu.model, vu.year, vu.acquired_on,
      c.code as cat, c.display_name as cat_name, l.code as loc, l.name as loc_name
    from vehicle_unit vu
    join vehicle_category c on c.id = vu.category_id
    join location l on l.id = vu.home_location_id
    where vu.organization_id = ${ctx.orgId} and vu.state <> 'retired'
      and ${inScope(sql`l.code`, ctx.scope)} and ${inCategories(sql`c.code`, ctx.categories)}
  ),
  fl as (
    select d.day, u.id, d.w from d join u on (u.acquired_on is null or u.acquired_on::date <= d.day)
  ),
  blk as (
    select d.day, b.unit_id as id,
      least(d.w, sum(greatest(0, extract(epoch from (
        least(coalesce(b.end_at, ${cutoff}, 'infinity'::timestamptz), d.e_eff) - greatest(b.start_at, d.s)
      ))) / 86400.0)) as blocked
    from d
    join vehicle_block b on b.start_at < d.e_eff
      and coalesce(b.end_at, ${cutoff}, 'infinity'::timestamptz) > d.s
    where b.unit_id in (select id from u)
    group by d.day, b.unit_id, d.w
  ),
  rn as (
    select d.day, rt.unit_id as id,
      sum(ov.frac) as rented,
      sum(ov.frac * (res.subtotal_minor / nullif(res.duration_hours / 24.0, 0)))
        filter (where res.currency = ${ctx.currency}) as earned
    from d
    join rental rt on rt.organization_id = ${ctx.orgId} and rt.picked_up_at is not null
      and rt.picked_up_at < d.e_eff and coalesce(rt.returned_at, now()) > d.s
      and rt.unit_id in (select id from u)
    cross join lateral (
      select greatest(0, extract(epoch from (
        least(coalesce(rt.returned_at, now()), d.e_eff) - greatest(rt.picked_up_at, d.s)
      ))) / 86400.0 as frac
    ) ov
    left join reservation res on res.reference = rt.reservation_reference
    group by d.day, rt.unit_id
  ),
  pud as (
    select f.day, f.id, f.w, coalesce(b.blocked, 0) as blocked,
      coalesce(r.rented, 0) as rented, coalesce(r.earned, 0) as earned
    from fl f
    left join blk b on b.day = f.day and b.id = f.id
    left join rn r on r.day = f.day and r.id = f.id
  )`;
}

interface Cell {
  fleetDays: number;
  blocked: number;
  rented: number;
  earned: number;
}
const zero = (): Cell => ({ fleetDays: 0, blocked: 0, rented: 0, earned: 0 });
const add = (a: Cell, b: Cell) => {
  a.fleetDays += b.fleetDays;
  a.blocked += b.blocked;
  a.rented += b.rented;
  a.earned += b.earned;
};
const rentable = (c: Cell) => c.fleetDays - c.blocked;

/** the figures every table row and card derives from a cell */
function figures(c: Cell, elapsedDays: number) {
  const r = rentable(c);
  return {
    fleet_size: elapsedDays > 0 ? Math.round((c.fleetDays / elapsedDays) * 10) / 10 : 0,
    rented_days: Math.round(c.rented * 100) / 100,
    rentable_days: Math.round(r * 100) / 100,
    blocked_days: Math.round(c.blocked * 100) / 100,
    utilization: ratio(c.rented, r),
    earned_minor: Math.round(c.earned),
    adr_minor: c.rented > 0 ? Math.round(c.earned / c.rented) : null,
    revpac_minor: r > 0 ? Math.round(c.earned / r) : null,
  };
}

async function measureFleet(
  ctx: AnalyticCtx,
  range: DayRange,
  buckets: Parameters<AnalyticDef['measure']>[2],
  detail: boolean,
): Promise<Measure> {
  const rows = await ctx.db.execute<Record<string, unknown>>(sql`${base(ctx, range)}
    select p.day::text as day, u.cat, max(u.cat_name) as cat_name, u.loc, max(u.loc_name) as loc_name,
      sum(p.w) as fleet_days, sum(p.blocked) as blocked, sum(p.rented) as rented, sum(p.earned) as earned
    from pud p join u on u.id = p.id
    group by p.day, u.cat, u.loc`);

  const all = zero();
  const perBucket = buckets.map(zero);
  const cat = new Map<string, { label?: string; cell: Cell }>();
  const loc = new Map<string, { label?: string; cell: Cell }>();
  const elapsed = new Set<string>();
  for (const r of rows) {
    const cell: Cell = {
      fleetDays: num(r.fleet_days),
      blocked: num(r.blocked),
      rented: num(r.rented),
      earned: num(r.earned),
    };
    elapsed.add(String(r.day));
    add(all, cell);
    const i = bucketIndex(String(r.day), buckets);
    if (i >= 0) add(perBucket[i]!, cell);
    for (const [map, key, label] of [
      [cat, String(r.cat), r.cat_name],
      [loc, String(r.loc), r.loc_name],
    ] as const) {
      const e = map.get(key) ?? { label: label ? String(label) : undefined, cell: zero() };
      add(e.cell, cell);
      map.set(key, e);
    }
  }
  // days that have started (a period in the future has none)
  const days = Math.max(elapsed.size, 0);
  const kpis: Measure['kpis'] = figures(all, days);

  const toRows = (m: Map<string, { label?: string; cell: Cell }>) =>
    [...m.entries()]
      .map(([key, v]) => ({ key, label: v.label, values: figures(v.cell, days) }))
      .sort(
        (a, b) =>
          (b.values.rented_days ?? 0) - (a.values.rented_days ?? 0) || a.key.localeCompare(b.key),
      );
  const totals = {
    utilization: kpis.utilization ?? null,
    adr_minor: kpis.adr_minor ?? null,
    revpac_minor: kpis.revpac_minor ?? null,
  };

  const states = await ctx.db.execute<{ state: string; n: number }>(sql`
    select vu.state, count(*)::int as n
    from vehicle_unit vu
    join vehicle_category c on c.id = vu.category_id
    join location l on l.id = vu.home_location_id
    where vu.organization_id = ${ctx.orgId} and ${inScope(sql`l.code`, ctx.scope)}
      and ${inCategories(sql`c.code`, ctx.categories)}
    group by vu.state order by n desc, vu.state`);

  const measure: Measure = {
    kpis,
    series: perBucket.map((c) => ({
      utilization: ratio(c.rented, rentable(c)) ?? 0,
      rented_days: Math.round(c.rented * 100) / 100,
    })),
    breakdowns: {
      category: { rows: toRows(cat), totals },
      location: { rows: toRows(loc), totals },
      vehicle_state: {
        rows: states.map((s) => ({ key: s.state, values: { vehicles: Number(s.n) } })),
      },
    },
  };

  if (detail) {
    const units = await ctx.db.execute<Record<string, unknown>>(sql`${base(ctx, range)}
      select u.plate, trim(concat_ws(' ', u.year, u.make, u.model)) as vehicle,
        u.cat as category, u.loc as location,
        coalesce(sum(p.w), 0) as fleet_days, coalesce(sum(p.blocked), 0) as blocked,
        coalesce(sum(p.rented), 0) as rented, coalesce(sum(p.earned), 0) as earned
      from u left join pud p on p.id = u.id
      group by u.id, u.plate, u.year, u.make, u.model, u.cat, u.loc
      order by rented desc, u.plate
      limit ${DETAIL_LIMIT}`);
    measure.detail = {
      columns: [
        { key: 'plate', format: 'text' },
        { key: 'vehicle', format: 'text' },
        { key: 'category', format: 'text' },
        { key: 'location', format: 'text' },
        { key: 'rented_days', format: 'decimal' },
        { key: 'blocked_days', format: 'decimal' },
        { key: 'utilization', format: 'percent' },
        { key: 'earned_minor', format: 'money' },
      ],
      rows: units.map((r) => {
        const c: Cell = {
          fleetDays: num(r.fleet_days),
          blocked: num(r.blocked),
          rented: num(r.rented),
          earned: num(r.earned),
        };
        return {
          plate: r.plate,
          vehicle: r.vehicle,
          category: r.category,
          location: r.location,
          rented_days: Math.round(c.rented * 100) / 100,
          blocked_days: Math.round(c.blocked * 100) / 100,
          utilization: ratio(c.rented, rentable(c)),
          earned_minor: int(c.earned),
        };
      }),
      total: units.length,
      truncated: units.length >= DETAIL_LIMIT,
    };
  }
  return measure;
}
