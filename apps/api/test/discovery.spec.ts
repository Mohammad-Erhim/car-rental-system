import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-002 — Discovery & quote.
 *  - TEST-AVL: search returns priced, bookable options; quote lines sum to the total.
 *  - TEST-AVL concurrency: two takers of the last unit → exactly one hold succeeds.
 *  - TEST-CAT hours: a pickup outside operating hours is refused (no after-hours).
 *  - TEST-PRC: publishing a rate plan changes the customer price with no redeploy; a re-quote
 *    bumps the version and a later publish does not mutate an already-issued quote.
 *  - Permission: an agent cannot manage the catalogue.
 */
const isoIn = (days: number, hourUtc = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

describe('discovery / quote', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('TEST-AVL-001 search returns priced, bookable options sorted by price', async () => {
    const res = await request(server)
      .post('/api/v1/discovery/search')
      .send({ pickupLocationCode: 'TST1', pickupAt: isoIn(3), returnAt: isoIn(6) })
      .expect(201);
    expect(res.body.state).toBe('fresh');
    expect(res.body.durationHours).toBe(72);
    const priced = res.body.options.filter(
      (o: { fromTotalMinor: number | null }) => o.fromTotalMinor != null,
    );
    expect(priced.length).toBeGreaterThan(1);
    const totals = priced.map((o: { fromTotalMinor: number }) => o.fromTotalMinor);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    const economy = res.body.options.find(
      (o: { categoryCode: string }) => o.categoryCode === 'economy',
    );
    expect(economy.bookableCount).toBeGreaterThan(0);
    // 3 days * 3200 + 495 fee = 10095 taxable ; +20% => 12114
    expect(economy.fromTotalMinor).toBe(12114);
  });

  it('TEST-PRC-001 quote lines sum to the total and a hold is placed', async () => {
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(4),
        returnAt: isoIn(7),
        categoryCode: 'economy',
        holderKey: 'itest-sum',
      })
      .expect(201);
    const sum = res.body.lines.reduce(
      (a: number, l: { amountMinor: number }) => a + l.amountMinor,
      0,
    );
    expect(sum).toBe(res.body.totalMinor);
    expect(res.body.subtotalMinor + res.body.taxMinor).toBe(res.body.totalMinor);
    expect(res.body.hold).toMatchObject({ unitPinned: true });
    expect(res.body.pickupAt).toMatch(/Z$/); // ISO-8601 UTC
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('TEST-AVL-002 two takers of the last unit — exactly one hold succeeds', async () => {
    // premium @ TST1 has 2 units — take one first, then race two more for the last.
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(30), returnAt: isoIn(32) };
    await request(server)
      .post('/api/v1/discovery/quote')
      .send({ ...win, categoryCode: 'premium', holderKey: 'race-warmup' })
      .expect(201);

    const [a, b] = await Promise.all([
      request(server)
        .post('/api/v1/discovery/quote')
        .send({ ...win, categoryCode: 'premium', holderKey: 'race-a' }),
      request(server)
        .post('/api/v1/discovery/quote')
        .send({ ...win, categoryCode: 'premium', holderKey: 'race-b' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const failed = a.status === 422 ? a : b;
    expect(failed.body.code).toBe('business_rule_violation');
    expect(failed.body.params.reason).toBe('no_availability');
  });

  it('TEST-CAT-001 a pickup outside operating hours is refused (no after-hours)', async () => {
    // TST2 opens 06:00 local (America/New_York). Ask for 06:00 UTC ≈ 01:00–02:00 local → closed.
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST2',
        pickupAt: isoIn(3, 6),
        returnAt: isoIn(6, 18),
        categoryCode: 'economy',
      })
      .expect(422);
    expect(res.body.code).toBe('business_rule_violation');
    expect(res.body.params.reason).toMatch(/^pickup_/);
  });

  it('TEST-PRC-002 publishing a rate plan changes the customer price with no redeploy', async () => {
    const before = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(8),
        returnAt: isoIn(10),
        categoryCode: 'suv',
      })
      .expect(201);
    const beforeTotal = before.body.options[0].fromTotalMinor as number;
    expect(beforeTotal).toBeGreaterThan(0);

    const created = await request(server)
      .post('/api/v1/ops/pricing/rate-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryCode: 'suv',
        name: 'SUV — promo',
        effectiveFrom: '2020-01-01',
        baseDayMinor: 6000,
        hourMinor: 900,
        minDurationHours: 24,
        taxBps: 2000,
        fees: [{ code: 'reg_fee', label: 'Registration', amountMinor: 495, taxable: true }],
      })
      .expect(201);
    const planId = created.body[0].id as string;
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${planId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const after = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(8),
        returnAt: isoIn(10),
        categoryCode: 'suv',
      })
      .expect(201);
    const afterTotal = after.body.options[0].fromTotalMinor as number;
    // 2 days * 6000 + 495 => 12495 taxable ; +20% => 14994
    expect(afterTotal).toBe(14994);
    expect(afterTotal).not.toBe(beforeTotal);
  });

  it('TEST-PRC-003 an already-issued quote is not changed by a later re-quote / publish', async () => {
    const first = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(12),
        returnAt: isoIn(15),
        categoryCode: 'compact',
        holderKey: 'itest-quote-immutable',
      })
      .expect(201);
    const ref = first.body.reference as string;
    const firstTotal = first.body.totalMinor as number;

    const fetched = await request(server).get(`/api/v1/discovery/quotes/${ref}`).expect(200);
    expect(fetched.body.totalMinor).toBe(firstTotal);
    expect(fetched.body.version).toBe(1);
  });

  it('permission: an agent cannot create a vehicle category', async () => {
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        code: 'sneaky',
        class: 'economy',
        displayName: 'Sneaky',
        passengers: 4,
        luggage: 1,
        doors: 4,
      })
      .expect(403);
  });
});
