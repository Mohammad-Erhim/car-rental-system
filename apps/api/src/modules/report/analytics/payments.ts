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
 * Payments & refunds — money that actually moved, on the day it moved (cash basis). "Collected" is
 * a successful capture, "refunded" a successful refund, both counted on the day the ledger records
 * them; a booking paid in August and refunded in September is collected in August and refunded in
 * September. Failed attempts are counted, not summed. Branch and category come from the reservation
 * a payment belongs to.
 */
const columns = [
  { key: 'collected_minor', format: 'money', share: true, additive: true },
  { key: 'refunded_minor', format: 'money', additive: true },
  { key: 'net_cash_minor', format: 'money', additive: true },
] as const;

export const payments: AnalyticDef = {
  code: 'payments',
  usesBasis: false,
  kpis: [
    { key: 'net_cash_minor', format: 'money', betterWhen: 'up' },
    { key: 'collected_minor', format: 'money', betterWhen: 'up' },
    { key: 'refunded_minor', format: 'money', betterWhen: 'down' },
    { key: 'refund_rate', format: 'percent', betterWhen: 'down' },
    { key: 'payments', format: 'count', betterWhen: 'up' },
    { key: 'avg_payment_minor', format: 'money', betterWhen: 'neutral' },
    { key: 'failed', format: 'count', betterWhen: 'down' },
    { key: 'tax_invoiced_minor', format: 'money', betterWhen: 'neutral' },
    { key: 'unpaid_minor', format: 'money', betterWhen: 'down', snapshot: true },
  ],
  series: [
    { key: 'collected_minor', format: 'money' },
    { key: 'refunded_minor', format: 'money' },
  ],
  breakdowns: ['purpose', 'method', 'category', 'location'].map((key) => ({
    key,
    columns: [...columns],
  })),
  notes: ['payments.cash', 'payments.failed', 'payments.tax', 'payments.unpaid'],
  currencyActivity: async (ctx, range) => {
    const rows = await ctx.db.execute<{ currency: string; n: number }>(sql`
      select p.currency, count(*)::int as n
      from payment p join payment_intent i on i.id = p.intent_id
      join reservation r on r.reference = p.reservation_reference
      where ${scopeWhere(ctx, range)}
      group by p.currency order by n desc, p.currency`);
    return rows.map((r) => ({ currency: r.currency, count: Number(r.n) }));
  },
  measure: (ctx, range, buckets, opts) => measurePayments(ctx, range, buckets, opts.detail),
};

/** the ledger rows of the period (aliases p = payment, i = payment_intent, r = reservation) */
function scopeWhere(
  ctx: Omit<AnalyticCtx, 'currency'> & { currency?: string },
  range: DayRange,
): SQL {
  return sql`i.organization_id = ${ctx.orgId}
    ${ctx.currency ? sql`and p.currency = ${ctx.currency}` : sql``}
    and ${within(sql`p.created_at`, ctx, range)}
    and ${inScope(sql`r.pickup_location_code`, ctx.scope)}
    and ${inCategories(sql`r.category_code`, ctx.categories)}`;
}

const OK_CAPTURE = sql`(p.type = 'capture' and p.outcome = 'succeeded')`;
const OK_REFUND = sql`(p.type = 'refund' and p.outcome = 'succeeded')`;
const SHOWN = sql`(p.type in ('capture','refund') or p.outcome = 'failed')`;
const FROM = sql`from payment p join payment_intent i on i.id = p.intent_id
  join reservation r on r.reference = p.reservation_reference`;

async function measurePayments(
  ctx: AnalyticCtx,
  range: DayRange,
  buckets: Parameters<AnalyticDef['measure']>[2],
  detail: boolean,
): Promise<Measure> {
  const where = scopeWhere(ctx, range);
  const tz = ctx.period.timezone;

  const [t] = await ctx.db.execute<Record<string, unknown>>(sql`
    select
      coalesce(sum(p.amount_minor) filter (where ${OK_CAPTURE}), 0) as collected,
      coalesce(sum(p.amount_minor) filter (where ${OK_REFUND}), 0) as refunded,
      count(*) filter (where ${OK_CAPTURE})::int as captures,
      count(*) filter (where p.outcome = 'failed' and p.type in ('authorize','capture'))::int as failed
    ${FROM} where ${where}`);

  // tax on the invoices issued in the period, net of credit notes
  const [tax] = await ctx.db.execute<Record<string, unknown>>(sql`
    select coalesce(sum(inv.tax_minor), 0) as tax
    from invoice inv join reservation r on r.reference = inv.reservation_reference
    where inv.organization_id = ${ctx.orgId} and inv.currency = ${ctx.currency}
      and ${within(sql`inv.issued_at`, ctx, range)}
      and ${inScope(sql`r.pickup_location_code`, ctx.scope)}
      and ${inCategories(sql`r.category_code`, ctx.categories)}`);

  // what confirmed or completed bookings still owe — a picture of now
  const [unpaid] = await ctx.db.execute<Record<string, unknown>>(sql`
    select coalesce(sum(r.total_minor - r.paid_minor), 0) as owed
    from reservation r
    where r.organization_id = ${ctx.orgId} and r.currency = ${ctx.currency}
      and r.state in ('confirmed','fulfilled') and r.paid_minor < r.total_minor
      and ${inScope(sql`r.pickup_location_code`, ctx.scope)}
      and ${inCategories(sql`r.category_code`, ctx.categories)}`);

  const collected = int(t?.collected);
  const refunded = int(t?.refunded);
  const captures = num(t?.captures);
  const kpis: Measure['kpis'] = {
    net_cash_minor: collected - refunded,
    collected_minor: collected,
    refunded_minor: refunded,
    refund_rate: ratio(refunded, collected),
    payments: captures,
    avg_payment_minor: captures ? Math.round(collected / captures) : null,
    failed: num(t?.failed),
    tax_invoiced_minor: int(tax?.tax),
    unpaid_minor: int(unpaid?.owed),
  };

  const perDay = await ctx.db.execute<Record<string, unknown>>(sql`
    select ${localDay(sql`p.created_at`, tz)} as day,
      coalesce(sum(p.amount_minor) filter (where ${OK_CAPTURE}), 0) as collected,
      coalesce(sum(p.amount_minor) filter (where ${OK_REFUND}), 0) as refunded
    ${FROM} where ${where} group by 1`);
  const series = foldDays(
    buckets,
    perDay.map((r) => ({ day: String(r.day), c: num(r.collected), r: num(r.refunded) })),
    ['collected_minor', 'refunded_minor'],
    (r, k) => (k === 'collected_minor' ? r.c : r.r),
  );

  const group = async (
    keySql: SQL,
    labelSql: SQL | null = null,
    joins: SQL = sql``,
  ): Promise<BreakdownRows> => {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select ${keySql} as key, ${labelSql ?? sql`null`} as label,
        coalesce(sum(p.amount_minor) filter (where ${OK_CAPTURE}), 0) as collected,
        coalesce(sum(p.amount_minor) filter (where ${OK_REFUND}), 0) as refunded
      ${FROM} ${joins}
      where ${where}
      group by 1
      having coalesce(sum(p.amount_minor) filter (where ${OK_CAPTURE} or ${OK_REFUND}), 0) > 0
      order by collected desc, key`);
    return rows.map((r) => ({
      key: String(r.key),
      label: r.label ? String(r.label) : undefined,
      values: {
        collected_minor: int(r.collected),
        refunded_minor: int(r.refunded),
        net_cash_minor: int(r.collected) - int(r.refunded),
      },
    }));
  };

  const measure: Measure = {
    kpis,
    series,
    breakdowns: {
      purpose: { rows: await group(sql`i.purpose`) },
      method: { rows: await group(sql`coalesce(i.method_brand, 'unknown')`) },
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
    },
  };

  if (detail) {
    const rows = await ctx.db.execute<Record<string, unknown>>(sql`
      select to_char(p.created_at at time zone ${tz}, 'YYYY-MM-DD HH24:MI') as at,
        p.reservation_reference as reference, p.type, p.outcome,
        case when p.type = 'refund' then -p.amount_minor else p.amount_minor end as amount_minor,
        i.purpose, coalesce(i.method_brand, '') as method, coalesce(p.failure_code, '') as failure,
        p.currency
      ${FROM} where ${where} and ${SHOWN}
      order by p.created_at desc, p.id
      limit ${DETAIL_LIMIT}`);
    const [count] = await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n ${FROM} where ${where} and ${SHOWN}`,
    );
    const shown = num(count?.n);
    measure.detail = {
      columns: [
        { key: 'at', format: 'text' },
        { key: 'reference', format: 'text' },
        { key: 'type', format: 'text' },
        { key: 'outcome', format: 'text' },
        { key: 'amount_minor', format: 'money' },
        { key: 'purpose', format: 'text' },
        { key: 'method', format: 'text' },
        { key: 'failure', format: 'text' },
      ],
      rows: rows.map((r) => ({ ...r })),
      total: shown,
      truncated: shown > rows.length,
    };
  }
  return measure;
}
