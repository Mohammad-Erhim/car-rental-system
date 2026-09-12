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
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = await getTestApp();
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

  it('a staff-initiated cancel notifies the customer, not the staff member who clicked cancel', async () => {
    const r = await bookEconomyAt(server, customerToken, 41);
    await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reasonCode: 'goodwill' })
      .expect(201);

    // the cancellation email is sent fire-and-forget (never blocks the cancel response) — poll
    // briefly rather than race it
    type Msg = { event: string; sourceId: string | null; recipient: string };
    let sent: Msg | undefined;
    for (let i = 0; i < 20 && !sent; i++) {
      const mail = await request(server).get('/api/v1/dev/mail?limit=100').expect(200);
      sent = (mail.body.messages as Msg[]).find(
        (m) => m.event === 'reservation_cancelled' && m.sourceId === r.reference,
      );
      if (!sent) await new Promise((res) => setTimeout(res, 150));
    }
    // the driver's email on the booking — never the acting admin's account id
    expect(sent?.recipient).toBe('ops@example.test');
  });

  it('rejects a cancel reason that is not an active cancel_reason value', async () => {
    const r = await bookEconomyAt(server, customerToken, 40);
    const bad = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'totally_made_up' })
      .expect(422);
    expect(bad.body.fieldErrors?.[0]?.path).toBe('reasonCode');
    // the reservation is untouched — a valid reason still cancels it
    await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'plans_changed' })
      .expect(201);
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

    // a modify reason must be an active adjustment_reason value
    await request(server)
      .post(`/api/v1/reservations/${r.reference}/modify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ returnAt: isoIn(55), paymentToken: 'tok_ok', reasonCode: 'not_a_reason' })
      .expect(422);

    const m = await request(server)
      .post(`/api/v1/reservations/${r.reference}/modify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ returnAt: isoIn(55), paymentToken: 'tok_ok', reasonCode: 'late_return' }) // 5 days instead of 3
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

    // the resolution is on the audit trail
    const audit = await request(server)
      .get('/api/v1/ops/audit?action=recovery_case.resolved')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (audit.body.entries as Array<{ targetId: string }>).some((r) => r.targetId === c.id),
    ).toBe(true);

    // resolving it again → 422 (already resolved); a bogus id → 404 (not a silent no-op)
    await request(server)
      .post(`/api/v1/ops/cases/${c.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'again' })
      .expect(422);
    await request(server)
      .post('/api/v1/ops/cases/00000000-0000-0000-0000-000000000000/resolve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'ghost' })
      .expect(404);
  });

  it('a recovery case can be retried — records the attempt, resolves once consistent, 404/400 guards', async () => {
    const q = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(140),
        returnAt: isoIn(143),
        categoryCode: 'suv',
        holderKey: 'retry',
      })
      .expect(201);
    const confirm = {
      quoteReference: q.body.reference,
      drivers: [{ role: 'primary_renter', fullName: 'Retry', email: 'r@example.test' }],
      acceptTerms: true,
      paymentToken: 'tok_ok',
    };
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ ...confirm, simulateWriteFailure: true })
      .expect(500);

    const openCases = await request(server)
      .get('/api/v1/ops/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const kase = openCases.body.find(
      (x: { kind: string; subjectRef: string; detail?: { retryCount?: number } }) =>
        x.kind === 'write_after_charge' && (x.detail?.retryCount ?? 0) === 0,
    );
    expect(kase).toBeTruthy();

    // bogus id → 404
    await request(server)
      .post('/api/v1/ops/cases/00000000-0000-0000-0000-000000000000/retry')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    // reservation still absent → attempt recorded, case stays open
    const first = await request(server)
      .post(`/api/v1/ops/cases/${kase.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(first.body).toMatchObject({ outcome: 'still_open', retryCount: 1, state: 'open' });

    // operator completes the booking (idempotent on the reservation reference) …
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(confirm)
      .expect(201);

    // … now the retry sees a consistent world and auto-resolves
    const second = await request(server)
      .post(`/api/v1/ops/cases/${kase.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(second.body).toMatchObject({ outcome: 'resolved', retryCount: 2, state: 'resolved' });

    const afterList = await request(server)
      .get('/api/v1/ops/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterList.body.some((x: { id: string }) => x.id === kase.id)).toBe(false);

    // already resolved → 422 (business-rule rejection)
    await request(server)
      .post(`/api/v1/ops/cases/${kase.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
  });

  describe('the staff reservation queue (GET /ops/reservations)', () => {
    it('view=queue is the actionable set: confirmed, no rental yet, with a true total', async () => {
      const a = await bookEconomyAt(server, customerToken, 110);
      const b = await bookEconomyAt(server, customerToken, 118);
      // assign a vehicle to `a` — it should drop out of the queue
      await request(server)
        .post(`/api/v1/ops/reservations/${a.reference}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const res = await request(server)
        .get('/api/v1/ops/reservations') // default view = queue
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const refs = (res.body.results as Array<{ reference: string; state: string }>).map(
        (r) => r.reference,
      );
      expect(res.body.view).toBe('queue');
      expect(refs).toContain(b.reference);
      expect(refs).not.toContain(a.reference); // has a rental now
      expect(
        (res.body.results as Array<{ state: string; assignedRentalRef: string | null }>).every(
          (r) => r.state === 'confirmed' && r.assignedRentalRef === null,
        ),
      ).toBe(true);
      expect(res.body.total).toBe(res.body.count); // not truncated at this size
      expect(typeof res.body.total).toBe('number');
    });

    it('view=all applies the state filter and returns cancelled rows too', async () => {
      const r = await bookEconomyAt(server, customerToken, 126);
      await request(server)
        .post(`/api/v1/reservations/${r.reference}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reasonCode: 'goodwill' })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/ops/reservations?view=all&state=cancelled')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const rows = res.body.results as Array<{ reference: string; state: string }>;
      expect(rows.every((x) => x.state === 'cancelled')).toBe(true);
      expect(rows.some((x) => x.reference === r.reference)).toBe(true);
    });

    it('a bad date filter is a 422, not a 500', async () => {
      await request(server)
        .get('/api/v1/ops/reservations?view=all&from=not-a-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(422);
    });

    it('a location-scoped actor only sees their own locations (FR-RPT-004)', async () => {
      const scoped = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff'))
        .accessToken;
      // scoped user has reservation.read + reservation.modify via finance_staff, confined to TST1;
      // every fixture books at TST1, so they see rows — the exclusion side is proven in search.spec
      const res = await request(server)
        .get('/api/v1/ops/reservations?view=all')
        .set('Authorization', `Bearer ${scoped}`)
        .expect(200);
      expect(
        (res.body.results as Array<{ pickupLocationCode: string }>).every(
          (r) => r.pickupLocationCode === 'TST1',
        ),
      ).toBe(true);

      // explicitly requesting a location outside the actor's own scope is a 403, not a silently
      // empty result (SRS-SEC-007)
      const rejected = await request(server)
        .get('/api/v1/ops/reservations?view=all&locationCode=TST2')
        .set('Authorization', `Bearer ${scoped}`)
        .expect(403);
      expect(rejected.body.title).toMatch(/don't have access/i);
    });
  });

  describe('the reservation detail + staff lifecycle actions', () => {
    it('detail carries assignedRentalRef; it is null until a vehicle is assigned', async () => {
      const r = await bookEconomyAt(server, customerToken, 132);
      const before = await request(server)
        .get(`/api/v1/reservations/${r.reference}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(before.body.assignedRentalRef).toBeNull();

      const assigned = await request(server)
        .post(`/api/v1/ops/reservations/${r.reference}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);
      const after = await request(server)
        .get(`/api/v1/reservations/${r.reference}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.assignedRentalRef).toBe(assigned.body.reference);
    });

    it('mark no-show: confirmed → no_show, writes history, only from confirmed', async () => {
      const r = await bookEconomyAt(server, customerToken, 138);
      const ns = await request(server)
        .post(`/api/v1/ops/reservations/${r.reference}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Desk waited 30 min' })
        .expect(201);
      expect(ns.body.state).toBe('no_show');

      const history = await request(server)
        .get(`/api/v1/reservations/${r.reference}/history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(history.body.some((e: { type: string }) => e.type === 'no_show')).toBe(true);

      // a second no-show is rejected (not confirmed any more)
      await request(server)
        .post(`/api/v1/ops/reservations/${r.reference}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(422);
    });

    it('a customer cannot mark a no-show', async () => {
      const r = await bookEconomyAt(server, customerToken, 144);
      await request(server)
        .post(`/api/v1/ops/reservations/${r.reference}/no-show`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });
});
