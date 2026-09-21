import { sql } from 'drizzle-orm';

import { reservationCurrencies, reservationWhere, ACTIVE } from './reservations';
import { basisColumn, foldDays, int, localDay, num, ratio } from './sql';
import { DETAIL_LIMIT, type AnalyticDef, type BreakdownRows, type Measure } from './types';

/**
 * Bookings — how demand turned into trips, and where it was lost. Unlike Sales this includes
 * checkouts that never finished, so "conversion" is honest: of everything started, how much was
 * confirmed; of what was confirmed, how much was cancelled or never collected.
 */
const counts = (label: string): AnalyticDef['breakdowns'][number] => ({
  key: label,
  columns: [
    { key: 'bookings', format: 'count', share: true, additive: true },
    { key: 'value_minor', format: 'money', additive: true },
  ],
});

export const bookings: AnalyticDef = {
  code: 'bookings',
  usesBasis: true,
  kpis: [
    { key: 'started', format: 'count', betterWhen: 'up' },
    { key: 'confirmed', format: 'count', betterWhen: 'up' },
    { key: 'conversion_rate', format: 'percent', betterWhen: 'up' },
    { key: 'cancelled', format: 'count', betterWhen: 'down' },
    { key: 'cancellation_rate', format: 'percent', betterWhen: 'down' },
    { key: 'no_show', format: 'count', betterWhen: 'down' },
    { key: 'no_show_rate', format: 'percent', betterWhen: 'down' },
    { key: 'avg_lead_days', format: 'decimal', betterWhen: 'neutral' },
    { key: 'avg_length_days', format: 'decimal', betterWhen: 'neutral' },
  ],
  series: [
    { key: 'confirmed', format: 'count' },
    { key: 'cancelled', format: 'count' },
  ],
  breakdowns: [
    counts('state'),
    counts('lead_time'),
    counts('length'),
    counts('reason'),
    counts('channel'),
    counts('category'),
    counts('location'),
  ],
  notes: ['bookings.basis', 'bookings.conversion', 'bookings.lead', 'bookings.rates'],
  currencyActivity: (ctx, range) => reservationCurrencies(ctx, range, false),
  measure: (ctx, range, buckets, opts) => measureBookings(ctx, range, buckets, opts.detail),
};

/** ordered buckets, so a table reads "same day … 30+ days" rather than by size */
const LEAD = sql`case
  when r.pickup_at - coalesce(r.confirmed_at, r.created_at) < interval '1 day' then '0_same_day'
  when r.pickup_at - coalesce(r.confirmed_at, r.created_at) < interval '4 days' then '1_1_3'
  when r.pickup_at - coalesce(r.confirmed_at, r.created_at) < interval '8 days' then '2_4_7'
  when r.pickup_at - coalesce(r.confirmed_at, r.created_at) < interval '15 days' then '3_8_14'
  when r.pickup_at - coalesce(r.confirmed_at, r.created_at) < interval '31 days' then '4_15_30'
  else '5_30_plus' end`;
const LENGTH = sql`case
  when r.duration_hours <= 24 then '0_1'
  when r.duration_hours <= 72 then '1_2_3'
  when r.duration_hours <= 168 then '2_4_7'
  when r.duration_hours <= 336 then '3_8_14'
  else '4_15_plus' end`;

async function measureBookings(
  ctx: Parameters<AnalyticDef['measure']>[0],
  range: Parameters<AnalyticDef['measure']>[1],
  buckets: Parameters<AnalyticDef['measure']>[2],
  detail: boolean,
): Promise<Measure> {
  const where = reservationWhere(ctx, range);
  const tz = ctx.period.timezone;

  const [t] = await ctx.db.execute<Record<string, unknown>>(sql`
    select count(*)::int as started,
      count(*) filter (where r.confirmed_at is not null)::int as confirmed,
      count(*) filter (where r.state = 'cancelled')::int as cancelled,
      count(*) filter (where r.state = 'no_show')::int as no_show,
      avg(extract(epoch from (r.pickup_at - r.confirmed_at)) / 86400.0)
        filter (where ${ACTIVE} and r.pickup_at >= r.confirmed_at) as lead,
      avg(r.duration_hours / 24.0) filter (where ${ACTIVE}) as length
    from reservation r where ${where}`);
  const confirmed = num(t?.confirmed);
  const kpis: Measure['kpis'] = {
    started: num(t?.started),
    confirmed,
    conversion_rate: ratio(confirmed, num(t?.started)),
    cancelled: num(t?.cancelled),
    cancellation_rate: ratio(num(t?.cancelled), confirmed),
    no_show: num(t?.no_show),
    no_show_rate: ratio(num(t?.no_show), confirmed),
    avg_lead_days: t?.lead === null ? null : Math.round(num(t?.lead) * 10) / 10,
    avg_length_days: t?.length === null ? null : Math.round(num(t?.length) * 10) / 10,
  };

  const perDay = await ctx.db.execute<Record<string, unknown>>(sql`
    select ${localDay(basisColumn(ctx.period.basis), tz)} as day,
      count(*) filter (where r.confirmed_at is not null)::int as confirmed,
      count(*) filter (where r.state = 'cancelled')::int as cancelled
    from reservation r where ${where} group by 1`);
  const series = foldDays(
    buckets,
    perDay.map((r) => ({
      day: String(r.day),
      confirmed: num(r.confirmed),
      cancelled: num(r.cancelled),
    })),
    ['confirmed', 'cancelled'],
    (r, k) => (k === 'confirmed' ? r.confirmed : r.cancelled),
  );

  const group = async (
    keySql: ReturnType<typeof sql>,
    opts: {
      labelSql?: ReturnType<typeof sql>;
      joins?: ReturnType<typeof sql>;
      extra?: ReturnType<typeof sql>;
    } = {},
  ): Promise<BreakdownRows> => {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select ${keySql} as key, ${opts.labelSql ?? sql`null`} as label,
        count(*)::int as n, coalesce(sum(r.total_minor), 0) as value
      from reservation r ${opts.joins ?? sql``}
      where ${where} ${opts.extra ?? sql``}
      group by 1 order by key`);
    return rows.map((r) => ({
      key: String(r.key),
      label: r.label ? String(r.label) : undefined,
      values: { bookings: num(r.n), value_minor: int(r.value) },
    }));
  };
  const byCount = (rows: BreakdownRows) =>
    [...rows].sort(
      (a, b) => (b.values.bookings ?? 0) - (a.values.bookings ?? 0) || a.key.localeCompare(b.key),
    );

  const breakdowns: Measure['breakdowns'] = {
    state: { rows: byCount(await group(sql`r.state`)) },
    lead_time: { rows: await group(LEAD, { extra: sql`and r.confirmed_at is not null` }) },
    length: { rows: await group(LENGTH, { extra: sql`and r.confirmed_at is not null` }) },
    reason: {
      rows: byCount(
        await group(sql`coalesce(r.cancel_reason_code, 'unspecified')`, {
          extra: sql`and r.state = 'cancelled'`,
        }),
      ),
    },
    channel: {
      rows: byCount(await group(sql`r.channel`, { extra: sql`and r.confirmed_at is not null` })),
    },
    category: {
      rows: byCount(
        await group(sql`r.category_code`, {
          labelSql: sql`max(c.display_name)`,
          joins: sql`left join vehicle_category c on c.organization_id = r.organization_id and c.code = r.category_code`,
          extra: sql`and r.confirmed_at is not null`,
        }),
      ),
    },
    location: {
      rows: byCount(
        await group(sql`r.pickup_location_code`, {
          labelSql: sql`max(l.name)`,
          joins: sql`left join location l on l.organization_id = r.organization_id and l.code = r.pickup_location_code`,
          extra: sql`and r.confirmed_at is not null`,
        }),
      ),
    },
  };

  const measure: Measure = { kpis, series, breakdowns };
  if (detail) {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select r.reference, ${localDay(basisColumn('booked'), tz)} as booked_on,
        to_char(r.pickup_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as pickup_at,
        round(extract(epoch from (r.pickup_at - coalesce(r.confirmed_at, r.created_at))) / 86400.0, 1)::float as lead_days,
        round(r.duration_hours / 24.0, 2)::float as days,
        r.category_code as category, r.pickup_location_code as location, r.channel, r.state,
        r.cancel_reason_code as reason, r.total_minor as gross_minor, r.currency
      from reservation r where ${where}
      order by ${basisColumn(ctx.period.basis)} desc, r.reference
      limit ${DETAIL_LIMIT}`);
    measure.detail = {
      columns: [
        { key: 'reference', format: 'text' },
        { key: 'booked_on', format: 'date' },
        { key: 'pickup_at', format: 'text' },
        { key: 'lead_days', format: 'decimal' },
        { key: 'days', format: 'decimal' },
        { key: 'category', format: 'text' },
        { key: 'location', format: 'text' },
        { key: 'channel', format: 'text' },
        { key: 'state', format: 'text' },
        { key: 'reason', format: 'text' },
        { key: 'gross_minor', format: 'money' },
      ],
      rows: rows.map((r) => ({ ...r })),
      total: kpis.started ?? 0,
      truncated: (kpis.started ?? 0) > rows.length,
    };
  }
  return measure;
}
