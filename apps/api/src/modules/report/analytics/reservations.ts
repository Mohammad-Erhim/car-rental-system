import { sql, type SQL } from 'drizzle-orm';

import { basisColumn, inCategories, inScope, within } from './sql';
import type { AnalyticCtx, DayRange } from './types';

/**
 * The reservations a period holds, by the date basis the person chose. Table alias is always `r`.
 * A reservation is a "booking" once it was confirmed; a checkout that never finished (pending,
 * expired) is not sales, but the Bookings report still counts it to show how many were lost.
 */
export function reservationWhere(
  ctx: Omit<AnalyticCtx, 'currency'> & { currency?: string },
  range: DayRange,
  opts: { confirmedOnly?: boolean } = {},
): SQL {
  return sql`r.organization_id = ${ctx.orgId}
    ${ctx.currency ? sql`and r.currency = ${ctx.currency}` : sql``}
    and ${within(basisColumn(ctx.period.basis), ctx, range)}
    and ${inScope(sql`r.pickup_location_code`, ctx.scope)}
    and ${inCategories(sql`r.category_code`, ctx.categories)}
    ${opts.confirmedOnly ? sql`and r.confirmed_at is not null` : sql``}`;
}

/** Bookings per currency in the period — which currency to show, and what is left out. */
export async function reservationCurrencies(
  ctx: Omit<AnalyticCtx, 'currency'>,
  range: DayRange,
  confirmedOnly = true,
): Promise<Array<{ currency: string; count: number }>> {
  const rows = await ctx.db.execute<{ currency: string; n: number }>(sql`
    select r.currency, count(*)::int as n
    from reservation r
    where ${reservationWhere(ctx, range, { confirmedOnly })}
    group by r.currency
    order by n desc, r.currency`);
  return rows.map((r) => ({ currency: r.currency, count: Number(r.n) }));
}

/** the states that count as sales */
export const ACTIVE = sql`r.state in ('confirmed','fulfilled')`;
export const LOST = sql`r.state in ('cancelled','no_show')`;
