import { sql } from 'drizzle-orm';

import { reservationCurrencies, reservationWhere, ACTIVE, LOST } from './reservations';
import { basisColumn, foldDays, int, localDay, num, ratio } from './sql';
import { DETAIL_LIMIT, type AnalyticDef, type BreakdownRows, type Measure } from './types';

/**
 * Sales & revenue — what was sold in the period. Revenue is the price of the reservations that
 * stand (confirmed or completed) *without tax*; tax is shown next to it, never mixed in. A
 * cancellation or no-show is not revenue; its value is shown as "lost" so it is not invisible.
 */
export const sales: AnalyticDef = {
  code: 'sales',
  usesBasis: true,
  kpis: [
    { key: 'net_minor', format: 'money', betterWhen: 'up' },
    { key: 'bookings', format: 'count', betterWhen: 'up' },
    { key: 'avg_booking_minor', format: 'money', betterWhen: 'up' },
    { key: 'adr_minor', format: 'money', betterWhen: 'up' },
    { key: 'avg_length_days', format: 'decimal', betterWhen: 'neutral' },
    { key: 'rental_days', format: 'decimal', betterWhen: 'up' },
    { key: 'tax_minor', format: 'money', betterWhen: 'neutral' },
    { key: 'gross_minor', format: 'money', betterWhen: 'up' },
    { key: 'ancillary_minor', format: 'money', betterWhen: 'up' },
    { key: 'attach_rate', format: 'percent', betterWhen: 'up' },
    { key: 'lost_minor', format: 'money', betterWhen: 'down' },
  ],
  series: [
    { key: 'net_minor', format: 'money' },
    { key: 'bookings', format: 'count' },
  ],
  breakdowns: ['category', 'location', 'channel'].map((key) => ({
    key,
    columns: [
      { key: 'bookings', format: 'count', additive: true },
      { key: 'rental_days', format: 'decimal', additive: true },
      { key: 'net_minor', format: 'money', share: true, additive: true },
      { key: 'adr_minor', format: 'money' },
      { key: 'lost_minor', format: 'money', additive: true },
    ],
  })),
  notes: ['sales.basis', 'sales.net', 'sales.adr', 'sales.ancillary', 'sales.lost'],
  currencyActivity: (ctx, range) => reservationCurrencies(ctx, range),
  measure: (ctx, range, buckets, opts) => measureSales(ctx, range, buckets, opts.detail),
};

const withRates = (r: {
  bookings: number;
  days: number;
  net: number;
  lost: number;
}): Record<string, number | null> => ({
  bookings: r.bookings,
  rental_days: Math.round(r.days * 100) / 100,
  net_minor: r.net,
  adr_minor: r.days > 0 ? Math.round(r.net / r.days) : null,
  lost_minor: r.lost,
});

async function measureSales(
  ctx: Parameters<AnalyticDef['measure']>[0],
  range: Parameters<AnalyticDef['measure']>[1],
  buckets: Parameters<AnalyticDef['measure']>[2],
  detail: boolean,
): Promise<Measure> {
  const where = reservationWhere(ctx, range, { confirmedOnly: true });
  const tz = ctx.period.timezone;

  const [total] = await ctx.db.execute<Record<string, unknown>>(sql`
    select
      count(*) filter (where ${ACTIVE})::int as bookings,
      coalesce(sum(r.subtotal_minor) filter (where ${ACTIVE}), 0) as net,
      coalesce(sum(r.tax_minor) filter (where ${ACTIVE}), 0) as tax,
      coalesce(sum(r.total_minor) filter (where ${ACTIVE}), 0) as gross,
      coalesce(sum(r.duration_hours) filter (where ${ACTIVE}), 0) / 24.0 as days,
      coalesce(sum(r.total_minor) filter (where ${LOST}), 0) as lost
    from reservation r where ${where}`);
  const [anc] = await ctx.db.execute<Record<string, unknown>>(sql`
    select coalesce(sum(l.amount_minor), 0) as amount, count(distinct r.id)::int as attached
    from reservation_line l join reservation r on r.id = l.reservation_id
    where l.kind in ('extra','protection') and ${ACTIVE} and ${where}`);

  const bookings = num(total?.bookings);
  const net = int(total?.net);
  const days = num(total?.days);
  const kpis: Measure['kpis'] = {
    net_minor: net,
    bookings,
    avg_booking_minor: bookings ? Math.round(net / bookings) : null,
    adr_minor: days > 0 ? Math.round(net / days) : null,
    avg_length_days: ratio(days, bookings),
    rental_days: Math.round(days * 100) / 100,
    tax_minor: int(total?.tax),
    gross_minor: int(total?.gross),
    ancillary_minor: int(anc?.amount),
    attach_rate: ratio(num(anc?.attached), bookings),
    lost_minor: int(total?.lost),
  };

  const perDay = await ctx.db.execute<Record<string, unknown>>(sql`
    select ${localDay(basisColumn(ctx.period.basis), tz)} as day,
      count(*) filter (where ${ACTIVE})::int as bookings,
      coalesce(sum(r.subtotal_minor) filter (where ${ACTIVE}), 0) as net
    from reservation r where ${where} group by 1`);
  const series = foldDays(
    buckets,
    perDay.map((r) => ({ day: String(r.day), bookings: num(r.bookings), net: num(r.net) })),
    ['net_minor', 'bookings'],
    (r, k) => (k === 'bookings' ? r.bookings : r.net),
  );

  const group = async (
    keySql: ReturnType<typeof sql>,
    labelSql: ReturnType<typeof sql>,
    joins: ReturnType<typeof sql>,
  ): Promise<BreakdownRows> => {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select ${keySql} as key, ${labelSql} as label,
        count(*) filter (where ${ACTIVE})::int as bookings,
        coalesce(sum(r.subtotal_minor) filter (where ${ACTIVE}), 0) as net,
        coalesce(sum(r.duration_hours) filter (where ${ACTIVE}), 0) / 24.0 as days,
        coalesce(sum(r.total_minor) filter (where ${LOST}), 0) as lost
      from reservation r ${joins}
      where ${where}
      group by 1
      order by net desc, key`);
    return rows.map((r) => ({
      key: String(r.key),
      label: r.label ? String(r.label) : undefined,
      values: withRates({
        bookings: num(r.bookings),
        days: num(r.days),
        net: int(r.net),
        lost: int(r.lost),
      }),
    }));
  };

  const breakdowns: Measure['breakdowns'] = {
    category: {
      rows: await group(
        sql`r.category_code`,
        sql`max(c.display_name)`,
        sql`left join vehicle_category c on c.organization_id = r.organization_id and c.code = r.category_code`,
      ),
    },
    location: {
      rows: await group(
        sql`r.pickup_location_code`,
        sql`max(l.name)`,
        sql`left join location l on l.organization_id = r.organization_id and l.code = r.pickup_location_code`,
      ),
    },
    channel: { rows: await group(sql`r.channel`, sql`null`, sql``) },
  };
  for (const b of Object.values(breakdowns)) b.totals = { adr_minor: kpis.adr_minor ?? null };

  const measure: Measure = { kpis, series, breakdowns };
  if (detail) {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select r.reference, ${localDay(basisColumn('booked'), tz)} as booked_on,
        to_char(r.pickup_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as pickup_at,
        to_char(r.return_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as return_at,
        r.category_code as category, r.pickup_location_code as location, r.channel, r.state,
        round(r.duration_hours / 24.0, 2)::float as days,
        r.subtotal_minor as net_minor, r.tax_minor, r.total_minor as gross_minor,
        r.paid_minor, r.currency
      from reservation r where ${where}
      order by ${basisColumn(ctx.period.basis)} desc, r.reference
      limit ${DETAIL_LIMIT}`);
    const [count] = await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n from reservation r where ${where}`,
    );
    measure.detail = {
      columns: [
        { key: 'reference', format: 'text' },
        { key: 'booked_on', format: 'date' },
        { key: 'pickup_at', format: 'text' },
        { key: 'return_at', format: 'text' },
        { key: 'category', format: 'text' },
        { key: 'location', format: 'text' },
        { key: 'channel', format: 'text' },
        { key: 'state', format: 'text' },
        { key: 'days', format: 'decimal' },
        { key: 'net_minor', format: 'money' },
        { key: 'tax_minor', format: 'money' },
        { key: 'gross_minor', format: 'money' },
        { key: 'paid_minor', format: 'money' },
      ],
      rows: rows.map((r) => ({ ...r })),
      total: num(count?.n),
      truncated: num(count?.n) > rows.length,
    };
  }
  return measure;
}
