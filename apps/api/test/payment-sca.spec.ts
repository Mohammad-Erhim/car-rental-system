import { createHash } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { payment, paymentIntent } from '../src/database/schema/payment';
import { reservation } from '../src/database/schema/reservation';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * DEC-040 — 3-D Secure / SCA at checkout. A card whose bank asks the customer to authenticate used
 * to be a flat decline ("try a different card"), so SCA-mandated cards (most European cards) could
 * not pay at all. Now `POST /bookings/confirm` answers `payment_action_required` (402) with the
 * processor's client secret — nothing charged, no reservation, the hold still live — the client
 * completes the challenge and submits the SAME request again, and `resume` captures the
 * authenticated payment. The simulator plays the bank: `tok_3ds` (customer completes it),
 * `tok_3ds_slow` (still busy on the first look), `tok_3ds_fail` (fails it).
 *
 * Only the checkout can run a challenge. Modify / extend / off-session settlement have no customer
 * in the loop, so a challenge there is still the decline it always was — asserted below.
 */
const DRIVERS = [{ role: 'primary_renter', fullName: 'Sca Tester', email: 'sca@example.test' }];
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
/** the deterministic reservation reference the checkout derives from a quote (booking.service `refFor`) */
const refFor = (quoteReference: string) =>
  `RES-${createHash('sha256').update(quoteReference).digest('hex').slice(0, 8).toUpperCase()}`;

describe('3-D Secure at checkout', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let customerToken: string;
  let day = 110;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  /** a fresh quote (own 3-day window, so tests never contend for the same units) */
  async function quote() {
    const start = day;
    day += 4;
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(start),
        returnAt: isoIn(start + 3),
        categoryCode: 'economy',
        holderKey: `sca-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    return res.body as { reference: string; totalMinor: number };
  }

  const confirm = (
    quoteReference: string,
    paymentToken: string,
    extra: Record<string, unknown> = {},
    token: string | null = customerToken,
  ) => {
    const req = request(server).post('/api/v1/bookings/confirm');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({
      quoteReference,
      drivers: DRIVERS,
      acceptTerms: true,
      paymentToken,
      ...extra,
    });
  };

  const intentFor = async (quoteReference: string) =>
    (
      await db
        .select()
        .from(paymentIntent)
        .where(
          and(
            eq(paymentIntent.reservationReference, refFor(quoteReference)),
            eq(paymentIntent.purpose, 'booking'),
          ),
        )
    )[0];
  const reservationsFor = (quoteReference: string) =>
    db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, refFor(quoteReference)));
  const ledgerOf = async (intentId: string) =>
    (
      await db
        .select({ type: payment.type, outcome: payment.outcome, failureCode: payment.failureCode })
        .from(payment)
        .where(eq(payment.intentId, intentId))
        .orderBy(asc(payment.createdAt))
    ).map((l) => `${l.type}:${l.outcome}${l.failureCode ? `(${l.failureCode})` : ''}`);

  it('asks for the bank challenge first — nothing charged, no reservation — then captures once the customer has authenticated', async () => {
    const q = await quote();

    const first = await confirm(q.reference, 'tok_3ds');
    expect(first.status).toBe(402);
    expect(first.body.code).toBe('payment_action_required');
    expect(first.body.category).toBe('business_rule');
    expect(first.body.params.clientSecret).toMatch(/^sim_secret_/);
    // the challenge is pending: an intent waiting on the bank, but no booking and no money
    const pending = await intentFor(q.reference);
    expect(pending).toMatchObject({ state: 'requires_action', failureCode: null });
    expect(pending!.providerRef).toBeTruthy();
    expect(pending!.capturedAt).toBeNull();
    expect(await reservationsFor(q.reference)).toEqual([]);

    // the customer completes the challenge; the SAME checkout is submitted again
    const second = await confirm(q.reference, 'tok_3ds').expect(201);
    expect(second.body.state).toBe('confirmed');
    expect(second.body.paidMinor).toBe(second.body.totalMinor);
    expect(second.body.reference).toBe(refFor(q.reference));

    const done = await intentFor(q.reference);
    expect(done).toMatchObject({
      id: pending!.id,
      state: 'captured',
      amountMinor: second.body.totalMinor,
    });
    expect(await ledgerOf(done!.id)).toEqual([
      'authorize:pending',
      'authorize:succeeded',
      'capture:succeeded',
    ]);
    expect(await reservationsFor(q.reference)).toHaveLength(1);

    // submitting it a third time (a double-click, a retry) does not book or charge again
    const third = await confirm(q.reference, 'tok_3ds').expect(201);
    expect(third.body.reference).toBe(second.body.reference);
    expect(await reservationsFor(q.reference)).toHaveLength(1);
    expect((await intentFor(q.reference))!.refundedMinor).toBe(0);
  });

  it('a customer still busy with the challenge is asked again, not charged and not failed', async () => {
    const q = await quote();
    const first = await confirm(q.reference, 'tok_3ds_slow');
    expect(first.status).toBe(402);
    const again = await confirm(q.reference, 'tok_3ds_slow'); // submitted before they finished
    expect(again.status).toBe(402);
    expect(again.body.code).toBe('payment_action_required');
    expect(again.body.params.clientSecret).toBeTruthy();
    expect(await reservationsFor(q.reference)).toEqual([]);
    expect(await intentFor(q.reference)).toMatchObject({
      state: 'requires_action',
      failureCode: null,
    });

    const finished = await confirm(q.reference, 'tok_3ds_slow').expect(201);
    expect(finished.body.state).toBe('confirmed');
    expect(await reservationsFor(q.reference)).toHaveLength(1);
  });

  it('a failed challenge is a decline that names why — and the customer can still pay with another card', async () => {
    const q = await quote();
    expect((await confirm(q.reference, 'tok_3ds_fail')).status).toBe(402);

    const failed = await confirm(q.reference, 'tok_3ds_fail');
    expect(failed.status).toBe(422);
    expect(failed.body.code).toBe('business_rule_violation');
    expect(failed.body.params.reason).toBe('authentication_failed');
    expect(await reservationsFor(q.reference)).toEqual([]);
    expect(await intentFor(q.reference)).toMatchObject({
      state: 'failed',
      failureCode: 'authentication_failed',
    });

    // another card on the same quote works — no reservation was left half-made
    const ok = await confirm(q.reference, 'tok_ok').expect(201);
    expect(ok.body.state).toBe('confirmed');
    expect(await intentFor(q.reference)).toMatchObject({ state: 'captured' });
    expect(await reservationsFor(q.reference)).toHaveLength(1);
  });

  it('offering a different card after starting a challenge drops the old attempt and charges the new card', async () => {
    const q = await quote();
    expect((await confirm(q.reference, 'tok_3ds')).status).toBe(402);
    const before = await intentFor(q.reference);

    const switched = await confirm(q.reference, 'tok_ok').expect(201); // no second challenge for a normal card
    expect(switched.body.state).toBe('confirmed');
    const after = await intentFor(q.reference);
    expect(after).toMatchObject({ id: before!.id, state: 'captured' });
    expect(after!.providerRef).not.toBe(before!.providerRef); // a fresh authorisation, not the abandoned one
    expect(await reservationsFor(q.reference)).toHaveLength(1);
  });

  it('a changed total (an extra added) after the challenge began starts over for the new amount — never captures the old one', async () => {
    const q = await quote();
    const first = await confirm(q.reference, 'tok_3ds');
    expect(first.status).toBe(402);
    const before = await intentFor(q.reference);
    expect(before!.amountMinor).toBe(q.totalMinor);

    // same card, but the customer added GPS: a different amount, so the authenticated payment
    // would be for the wrong sum — a new challenge for the new sum is required
    const withExtra = await confirm(q.reference, 'tok_3ds', { extraCodes: ['gps'] });
    expect(withExtra.status).toBe(402);
    expect(withExtra.body.params.clientSecret).not.toBe(first.body.params.clientSecret);
    const restarted = await intentFor(q.reference);
    expect(restarted!.amountMinor).toBeGreaterThan(q.totalMinor);
    expect(restarted).toMatchObject({ state: 'requires_action', failureCode: null });
    expect(await reservationsFor(q.reference)).toEqual([]);

    const done = await confirm(q.reference, 'tok_3ds', { extraCodes: ['gps'] }).expect(201);
    expect(done.body.totalMinor).toBe(restarted!.amountMinor);
    expect(done.body.paidMinor).toBe(done.body.totalMinor);
    expect((await intentFor(q.reference))!.amountMinor).toBe(done.body.totalMinor);
  });

  it('works for a guest with no account, and the guest link is issued only once the payment is captured', async () => {
    const q = await quote();
    const first = await confirm(q.reference, 'tok_3ds', {}, null);
    expect(first.status).toBe(402);
    expect(first.body.guestAccessToken).toBeUndefined();

    const booked = await confirm(q.reference, 'tok_3ds', {}, null).expect(201);
    expect(booked.body.state).toBe('confirmed');
    expect(booked.body.guestAccessToken).toBeTruthy();
    await request(server)
      .get(`/api/v1/bookings/${booked.body.reference}`)
      .query({ token: booked.body.guestAccessToken })
      .expect(200);
  });

  it('a normal card is untouched by all of this — one request, charged, confirmed', async () => {
    const q = await quote();
    const res = await confirm(q.reference, 'tok_ok').expect(201);
    expect(res.body.state).toBe('confirmed');
    expect(await ledgerOf((await intentFor(q.reference))!.id)).toEqual([
      'authorize:succeeded',
      'capture:succeeded',
    ]);
  });

  it('modify / extend charges (no customer in the loop) still treat a challenge as the decline it always was', async () => {
    const q = await quote();
    const booked = await confirm(q.reference, 'tok_ok').expect(201);
    const ref = booked.body.reference as string;
    const originalReturn = booked.body.returnAt as string;

    const modify = await request(server)
      .post(`/api/v1/reservations/${ref}/modify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        returnAt: new Date(new Date(originalReturn).getTime() + 2 * 86_400_000).toISOString(),
        paymentToken: 'tok_3ds',
      });
    expect(modify.status).toBe(422);
    expect(modify.body.code).toBe('business_rule_violation');
    expect(modify.body.params.reason).toBe('requires_action');
    expect(modify.body.code).not.toBe('payment_action_required');

    // …and the reservation is exactly as it was
    const still = await request(server)
      .get(`/api/v1/reservations/${ref}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(new Date(still.body.returnAt).toISOString()).toBe(
      new Date(originalReturn).toISOString(),
    );
    expect(still.body.state).toBe('confirmed');
  });
});
