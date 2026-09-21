import { bookings } from './bookings';
import { fleet } from './fleet';
import { payments } from './payments';
import { reservationCurrencies } from './reservations';
import { sales } from './sales';
import type { AnalyticDef, Measure } from './types';

/**
 * Business overview — the handful of numbers an owner looks at first, each from the report that
 * defines it, so the overview can never disagree with the detailed reports.
 */
const pick = (list: AnalyticDef['kpis'], keys: string[]) =>
  keys.map((k) => list.find((s) => s.key === k)!);

export const overview: AnalyticDef = {
  code: 'overview',
  usesBasis: true,
  kpis: [
    ...pick(sales.kpis, ['net_minor', 'bookings', 'adr_minor']),
    ...pick(fleet.kpis, ['utilization', 'revpac_minor']),
    ...pick(bookings.kpis, ['cancellation_rate']),
    ...pick(payments.kpis, ['net_cash_minor']),
    ...pick(payments.kpis, ['unpaid_minor']),
  ],
  series: sales.series,
  breakdowns: sales.breakdowns.filter((b) => b.key !== 'channel'),
  notes: ['overview.where', 'sales.basis', 'fleet.formula', 'payments.cash'],
  currencyActivity: (ctx, range) => reservationCurrencies(ctx, range),
  async measure(ctx, range, buckets, _opts) {
    const [s, f, b, p] = await Promise.all([
      sales.measure(ctx, range, buckets, { detail: false }),
      fleet.measure(ctx, range, buckets, { detail: false }),
      bookings.measure(ctx, range, buckets, { detail: false }),
      payments.measure(ctx, range, buckets, { detail: false }),
    ]);
    const kpis: Measure['kpis'] = {
      net_minor: s.kpis.net_minor ?? null,
      bookings: s.kpis.bookings ?? null,
      adr_minor: s.kpis.adr_minor ?? null,
      utilization: f.kpis.utilization ?? null,
      revpac_minor: f.kpis.revpac_minor ?? null,
      cancellation_rate: b.kpis.cancellation_rate ?? null,
      net_cash_minor: p.kpis.net_cash_minor ?? null,
      unpaid_minor: p.kpis.unpaid_minor ?? null,
    };
    return {
      kpis,
      series: s.series,
      breakdowns: { category: s.breakdowns.category!, location: s.breakdowns.location! },
    };
  },
};
