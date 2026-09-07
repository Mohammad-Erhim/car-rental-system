import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-004 — Reservation operations.
 *  - cancel: idempotent; refund = paid − cancellation fee; a confirmed reservation frees its
 *    capacity when cancelled.
 *  - modify: re-prices, settles the delta, keeps a valid snapshot; a modify to a fully-booked
 *    window fails and leaves the original reservation (and capacity) intact (TEST-ERR-003).
 *  - history: every consequential action writes one append-only event.
 *  - reconciliation: an injected mismatch becomes an owned exception that can be resolved.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function bookEconomyAt(
  server: ReturnType<typeof httpServer>,
  token: string,
  pickupDay: number,
  days = 3,
) {
  const quote = await request(server)
    .post('/api/v1/discovery/quote')
    .send({
      pickupLocationCode: 'TST1',
      pickupAt: isoIn(pickupDay),
      returnAt: isoIn(pickupDay + days),
      categoryCode: 'economy',
      holderKey: `ro-${Math.random().toString(36).slice(2)}`,
    })
    .expect(201);
  const res = await request(server)
    .post('/api/v1/bookings/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({
      quoteReference: quote.body.reference,
      drivers: [{ role: 'primary_renter', fullName: 'Ops Tester', email: 'ops@example.test' }],
      acceptTerms: true,
      paymentToken: 'tok_ok',
    })
    .expect(201);
  return res.body as { reference: string; totalMinor: number; paidMinor: number };
}

describe('reservation operations', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('TEST-RSV-001 cancel outside the fee window → full refund; idempotent', async () => {
    const r = await bookEconomyAt(server, customerToken, 40); // 40 days out → free cancel
    const c1 = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'plans_changed' })
      .expect(201);
    expect(c1.body.state).toBe('cancelled');
    expect(c1.body.refundMinor).toBe(r.paidMinor);
    expect(c1.body.feeMinor).toBe(0);

    // idempotent — a second cancel returns the same result, no extra refund
    const c2 = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'plans_changed' })
      .expect(201);
    expect(c2.body.state).toBe('cancelled');

    const history = await request(server)
      .get(`/api/v1/reservations/${r.reference}/history`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const cancels = history.body.filter((e: { type: string }) => e.type === 'cancelled');
    expect(cancels).toHaveLength(1); // exactly one event
  });

  it('a late cancel keeps a 20% fee', async () => {
    const r = await bookEconomyAt(server, customerToken, 1); // 1 day out → late
    const c = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'plans_changed' })
      .expect(201);
    expect(c.body.feeMinor).toBe(Math.round((r.totalMinor * 2000) / 10000));
    expect(c.body.refundMinor).toBe(r.paidMinor - c.body.feeMinor);
  });

  it('TEST-RSV-002 modify extends the rental, charges the delta, keeps the snapshot valid', async () => {
    const r = await bookEconomyAt(server, customerToken, 50, 3);
    const before = r.totalMinor;
    const m = await request(server)
      .post(`/api/v1/reservations/${r.reference}/modify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ returnAt: isoIn(55), paymentToken: 'tok_ok' }) // 5 days instead of 3
      .expect(201);
    expect(m.body.deltaMinor).toBeGreaterThan(0);
    expect(m.body.totalMinor).toBe(before + m.body.deltaMinor);
    // lines still sum to the (new) total
    const sum = m.body.lines.reduce(
      (a: number, l: { amountMinor: number }) => a + l.amountMinor,
      0,
    );
    expect(sum).toBe(m.body.totalMinor);

    const history = await request(server)
      .get(`/api/v1/reservations/${r.reference}/history`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(history.body.some((e: { type: string }) => e.type === 'modified')).toBe(true);
  });

  it('TEST-ERR-003 a modify into a full window fails and leaves the reservation untouched', async () => {
    // premium @ TST1 has 2 units. Fill both for a target window, then book a 3rd elsewhere and
    // try to move it into the full window.
    const win = { pickupLocationCode: 'TST1' as const, pickupAt: isoIn(70), returnAt: isoIn(72) };
    for (const who of ['a', 'b']) {
      const q = await request(server)
        .post('/api/v1/discovery/quote')
        .send({ ...win, categoryCode: 'premium', holderKey: `full-${who}` })
        .expect(201);
      await request(server)
        .post('/api/v1/bookings/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          quoteReference: q.body.reference,
          drivers: [{ role: 'primary_renter', fullName: 'Filler', email: 'f@example.test' }],
          acceptTerms: true,
          paymentToken: 'tok_ok',
        })
        .expect(201);
    }
    // a 3rd premium booking in a different window
    const q3 = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(80),
        returnAt: isoIn(82),
        categoryCode: 'premium',
        holderKey: 'mover',
      })
      .expect(201);
    const third = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q3.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Mover', email: 'm@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);

    const move = await request(server)
      .post(`/api/v1/reservations/${third.body.reference}/modify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ pickupAt: win.pickupAt, returnAt: win.returnAt })
      .expect(422);
    expect(move.body.params.reason).toBe('no_availability');

    // the reservation is unchanged
    const still = await request(server)
      .get(`/api/v1/reservations/${third.body.reference}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(still.body.pickupAt).toBe(isoIn(80));
    expect(still.body.totalMinor).toBe(third.body.totalMinor);
  });

  it('reconciliation surfaces an injected mismatch as an owned exception that resolves', async () => {
    const r = await bookEconomyAt(server, customerToken, 45);
    const run = await request(server)
      .post('/api/v1/ops/payments/reconciliation/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ injectMismatchRef: r.reference })
      .expect(201);
    expect(run.body.exceptionsOpened).toBeGreaterThanOrEqual(1);

    const list = await request(server)
      .get('/api/v1/ops/payments/reconciliation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const exc = list.body.find(
      (e: { reservationReference: string }) => e.reservationReference === r.reference,
    );
    expect(exc).toBeTruthy();
    expect(exc.kind).toBe('amount_mismatch');

    await request(server)
      .post(`/api/v1/ops/payments/reconciliation/${exc.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'provider statement corrected' })
      .expect(201);

    const after = await request(server)
      .get('/api/v1/ops/payments/reconciliation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.some((e: { id: string }) => e.id === exc.id)).toBe(false);
  });

  it('the write-after-charge recovery case is listed and resolvable', async () => {
    const q = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(90),
        returnAt: isoIn(93),
        categoryCode: 'suv',
        holderKey: 'case',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Case', email: 'c@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
        simulateWriteFailure: true,
      })
      .expect(500);

    const cases = await request(server)
      .get('/api/v1/ops/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const c = cases.body.find((x: { kind: string }) => x.kind === 'write_after_charge');
    expect(c).toBeTruthy();
    await request(server)
      .post(`/api/v1/ops/cases/${c.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'reconciled manually' })
      .expect(201);
  });
});
