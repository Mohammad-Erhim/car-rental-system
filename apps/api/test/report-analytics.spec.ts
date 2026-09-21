import type { AnalyticReport } from '@carrental/contracts';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { reportRun } from '../src/database/schema/admin';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * The reporting hub: a report answers for a period, compares it, and every number that appears
 * twice (a card, a chart, a table row, a total) must agree with every other place it appears.
 */
function tuesday(daysOut: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOut);
  d.setUTCHours(14, 0, 0, 0);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
const plus = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

describe('reporting hub', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let admin: string;
  let scoped: string;
  let customer: string;

  const post = (path: string, body: object, token = admin) =>
    request(server).post(path).set('Authorization', `Bearer ${token}`).send(body);
  const preview = async (code: string, params: object = {}, token = admin) =>
    (await post(`/api/v1/ops/reports/${code}/preview`, { params }, token).expect(201)).body as {
      report: AnalyticReport;
      runId: string | null;
    };
  const kpi = (r: AnalyticReport, key: string) => r.kpis.find((k) => k.key === key)!;
  const sum = (xs: Array<number | null | undefined>) =>
    xs.reduce<number>((n, x) => n + (x ?? 0), 0);
  const P = { preset: 'last_7_days', compare: 'previous' } as const;

  async function book(location: string, pickupAt: string, days: number) {
    const opts = {
      pickupLocationCode: location,
      categoryCode: 'economy',
      pickupAt,
      returnAt: plus(pickupAt, days),
    };
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({ ...opts, holderKey: `rpa-${Math.random().toString(36).slice(2)}` })
      .expect(201);
    return (
      await request(server)
        .post('/api/v1/bookings/confirm')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          quoteReference: quote.body.reference,
          drivers: [{ role: 'primary_renter', fullName: 'Ana Lytics', email: 'ana@example.test' }],
          acceptTerms: true,
          paymentToken: 'tok_ok',
        })
        .expect(201)
    ).body.reference as string;
  }

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    scoped = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
    await book('TST1', tuesday(3), 2);
    await book('TST1', tuesday(10), 3);
    await book('TST2', tuesday(6), 2);
  });
  afterAll(closeTestApp);

  it('lists the reports, each tied to its own scope', async () => {
    const list = (
      await request(server)
        .get('/api/v1/ops/reports')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200)
    ).body as Array<{ code: string; scope: string }>;
    for (const code of ['overview', 'sales', 'bookings', 'fleet', 'payments', 'operations'])
      expect(list.find((d) => d.code === code)?.scope).toBe('location');
  });

  it('a preview stores nothing; a run is kept and can be opened again', async () => {
    const runs = async () => (await db.select({ n: count() }).from(reportRun))[0]!.n;
    const before = await runs();
    const shown = await preview('sales', P);
    expect(shown.runId).toBeNull();
    expect(await runs()).toBe(before);

    const saved = (await post('/api/v1/ops/reports/sales/run', { params: P }).expect(201)).body;
    expect(saved.runId).toBeTruthy();
    expect(await runs()).toBe(before + 1);
    const again = (
      await request(server)
        .get(`/api/v1/ops/reports/runs/${saved.runId}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200)
    ).body;
    expect(again.report.kpis).toEqual(saved.report.kpis);
    expect(again.kind).toBe('analytic');
    const [row] = await db.select().from(reportRun).where(eq(reportRun.id, saved.runId));
    expect(row!.summary).toBeTruthy();
    // the export of an analytic run is its detail rows
    const csv = await request(server)
      .get(`/api/v1/ops/reports/runs/${saved.runId}/export`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(csv.text.split('\n')[0]).toContain('reference');
  });

  it('sales: every figure agrees with every other place it appears', async () => {
    const { report: r } = await preview('sales', { ...P, preset: 'today', compare: 'none' });
    const wide = (await preview('sales', { preset: 'last_30_days', compare: 'previous' })).report;
    for (const rep of [r, wide]) {
      const net = kpi(rep, 'net_minor').value!;
      const bookings = kpi(rep, 'bookings').value!;
      // the chart, and every table, add up to the card
      expect(sum(rep.series!.points.map((p) => p.values.net_minor))).toBe(net);
      expect(sum(rep.series!.points.map((p) => p.values.bookings))).toBe(bookings);
      for (const b of rep.breakdowns) {
        expect(sum(b.rows.map((x) => x.values.net_minor))).toBe(net);
        expect(b.totals.net_minor).toBe(net);
        expect(sum(b.rows.map((x) => x.values.bookings))).toBe(bookings);
      }
      // revenue + tax = what customers pay
      expect(kpi(rep, 'gross_minor').value).toBe(net + kpi(rep, 'tax_minor').value!);
      if (bookings) expect(kpi(rep, 'avg_booking_minor').value).toBe(Math.round(net / bookings));
    }
    expect(kpi(wide, 'bookings').value).toBeGreaterThanOrEqual(3);
    expect(wide.currency).toBe('USD');
    expect(wide.otherCurrencies).toEqual([]);
    expect(wide.detail!.total).toBeGreaterThanOrEqual(3);
    // detail rows are the same bookings the card counts
    expect(
      wide.detail!.rows.filter((x) => ['confirmed', 'fulfilled'].includes(String(x.state))).length,
    ).toBe(kpi(wide, 'bookings').value);
  });

  it('the time frame: presets resolve in the report zone, the comparison is as long as the period', async () => {
    const { report } = await preview('sales', { preset: 'last_7_days', compare: 'previous' });
    expect(report.period.days).toBe(7);
    expect(report.period.timezone).toBe('America/New_York');
    expect(report.period.granularity).toBe('day');
    expect(report.series!.points).toHaveLength(7);
    expect(report.period.compare!.to < report.period.from).toBe(true);
    expect(report.series!.points.every((p) => p.previous)).toBe(true);
    const year = (await preview('sales', { preset: 'last_month', compare: 'year' })).report;
    expect(year.period.compare!.kind).toBe('year');
    expect(year.period.compare!.from.slice(0, 4)).toBe(
      String(Number(year.period.from.slice(0, 4)) - 1),
    );
    const none = (await preview('sales', { preset: 'this_year', compare: 'none' })).report;
    expect(none.period.compare).toBeNull();
    expect(none.kpis.every((k) => k.previous === null)).toBe(true);
    expect(none.period.granularity).toBe('month');
  });

  it('a period that makes no sense is refused, not quietly changed', async () => {
    await post('/api/v1/ops/reports/sales/preview', { params: { preset: 'custom' } }).expect(422);
    await post('/api/v1/ops/reports/sales/preview', {
      params: { preset: 'custom', from: '2026-03-10', to: '2026-03-01' },
    }).expect(422);
    await post('/api/v1/ops/reports/sales/preview', {
      params: { preset: 'custom', from: '2020-01-01', to: '2026-01-01' },
    }).expect(422);
    await post('/api/v1/ops/reports/sales/preview', { params: { preset: 'forever' } }).expect(422);
  });

  it('a person limited to a branch sees only that branch — and cannot ask for another', async () => {
    const own = (await preview('sales', { preset: 'last_30_days' }, scoped)).report;
    expect(own.scope.locations).toEqual(['TST1']);
    for (const row of own.breakdowns.find((b) => b.key === 'location')!.rows)
      expect(row.key).toBe('TST1');
    const all = (await preview('sales', { preset: 'last_30_days' })).report;
    expect(kpi(all, 'bookings').value!).toBeGreaterThan(kpi(own, 'bookings').value!);
    await post(
      '/api/v1/ops/reports/sales/preview',
      { params: { locationCode: 'TST2' } },
      scoped,
    ).expect(403);
    // an administrator can narrow to one branch
    const one = (await preview('sales', { preset: 'last_30_days', locationCode: 'TST2' })).report;
    expect(one.breakdowns.find((b) => b.key === 'location')!.rows.map((x) => x.key)).toEqual([
      'TST2',
    ]);
  });

  it('a category filter narrows every figure', async () => {
    const none = (
      await preview('sales', { preset: 'last_30_days', categoryCodes: ['no-such-class'] })
    ).report;
    expect(kpi(none, 'bookings').value).toBe(0);
    expect(kpi(none, 'net_minor').value).toBe(0);
    expect(kpi(none, 'adr_minor').value).toBeNull(); // nothing to divide by is "not available", never 0
  });

  it('bookings: the states add up to everything started', async () => {
    const { report } = await preview('bookings', { preset: 'last_30_days' });
    const started = kpi(report, 'started').value!;
    expect(started).toBeGreaterThanOrEqual(3);
    const states = report.breakdowns.find((b) => b.key === 'state')!;
    expect(sum(states.rows.map((r) => r.values.bookings))).toBe(started);
    for (const key of ['lead_time', 'length', 'channel', 'category', 'location'])
      expect(
        sum(report.breakdowns.find((b) => b.key === key)!.rows.map((r) => r.values.bookings)),
      ).toBe(kpi(report, 'confirmed').value);
    expect(kpi(report, 'conversion_rate').value).toBeLessThanOrEqual(1);
    expect(kpi(report, 'avg_lead_days').value).toBeGreaterThan(0); // booked days ahead
  });

  it('payments: collected − refunded = net, by day, by breakdown and in total', async () => {
    const { report } = await preview('payments', { preset: 'last_30_days' });
    const collected = kpi(report, 'collected_minor').value!;
    const refunded = kpi(report, 'refunded_minor').value!;
    expect(collected).toBeGreaterThan(0);
    expect(kpi(report, 'net_cash_minor').value).toBe(collected - refunded);
    expect(sum(report.series!.points.map((p) => p.values.collected_minor))).toBe(collected);
    for (const key of ['purpose', 'method', 'category', 'location']) {
      const b = report.breakdowns.find((x) => x.key === key)!;
      expect(sum(b.rows.map((r) => r.values.collected_minor))).toBe(collected);
    }
    expect(kpi(report, 'unpaid_minor').snapshot).toBe(true);
    expect(kpi(report, 'unpaid_minor').previous).toBeNull();
  });

  it('fleet: utilisation is a share of rentable days, and the parts add up', async () => {
    const { report } = await preview('fleet', { preset: 'last_30_days' });
    const util = kpi(report, 'utilization').value;
    expect(util === null || (util >= 0 && util <= 1)).toBe(true);
    expect(kpi(report, 'rentable_days').value!).toBeGreaterThan(0);
    const rented = kpi(report, 'rented_days').value!;
    for (const key of ['category', 'location']) {
      const b = report.breakdowns.find((x) => x.key === key)!;
      expect(sum(b.rows.map((r) => r.values.rented_days))).toBeCloseTo(rented, 1);
    }
    const states = report.breakdowns.find((b) => b.key === 'vehicle_state')!;
    expect(states.snapshot).toBe(true);
    expect(states.rows.every((r) => !r.previous)).toBe(true);
    // one row per vehicle in the detail
    expect(report.detail!.rows.length).toBeGreaterThan(0);
    expect(report.detail!.columns.map((c) => c.key)).toContain('utilization');
  });

  it('operations and the overview run, and the overview agrees with the detailed reports', async () => {
    const ops = (await preview('operations', { preset: 'last_30_days' })).report;
    expect(ops.kpis.map((k) => k.key)).toContain('on_time_rate');
    const overview = (await preview('overview', { preset: 'last_30_days' })).report;
    const sales = (await preview('sales', { preset: 'last_30_days' })).report;
    const fleet = (await preview('fleet', { preset: 'last_30_days' })).report;
    expect(kpi(overview, 'net_minor').value).toBe(kpi(sales, 'net_minor').value);
    expect(kpi(overview, 'bookings').value).toBe(kpi(sales, 'bookings').value);
    expect(kpi(overview, 'utilization').value).toBe(kpi(fleet, 'utilization').value);
  });

  it('only people who may read reports can run them', async () => {
    await post('/api/v1/ops/reports/sales/preview', { params: {} }, customer).expect(403);
  });
});
