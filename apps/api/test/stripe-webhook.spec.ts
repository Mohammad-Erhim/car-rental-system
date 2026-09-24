import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Only the piece of the Stripe SDK that would otherwise make a real network call is faked
// (`balance.retrieve()`, used by `PaymentConfigService.verifyOrThrow` to validate a saved secret
// key) — a key containing "invalidkey" fails, same convention as payment-config.spec.ts. The
// static `Stripe.webhooks` helper (`constructEvent`/`generateTestHeaderString`) is left as the
// REAL implementation via `importActual`: it's pure HMAC-SHA256 signing/verification with no
// network dependency, and it's exactly the mechanism this file exists to exercise for real rather
// than assert-by-reading-the-code.
vi.mock('stripe', async () => {
  const actual = await vi.importActual<typeof import('stripe')>('stripe');
  class FakeStripe {
    constructor(private readonly key: string) {}
    balance = {
      retrieve: async () => {
        if (this.key.includes('invalidkey')) {
          throw { type: 'StripeAuthenticationError', message: 'Invalid API Key provided' };
        }
        return { object: 'balance' };
      },
    };
  }
  (FakeStripe as unknown as { webhooks: typeof actual.webhooks }).webhooks = actual.webhooks;
  return { default: FakeStripe };
});

import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { organization } from '../src/database/schema/org';
import { paymentIntent } from '../src/database/schema/payment';
import { idempotencyKey } from '../src/database/schema/platform';
import { PaymentService } from '../src/modules/payment/payment.service';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * POST /webhooks/stripe (DEC-006: duplicate/out-of-order webhook, signature failure). Until now
 * this endpoint was only ever exercised indirectly, via `route-manifest.spec.ts`'s snapshot of
 * its method/path/guard — signature verification, missing-header rejection, and
 * replay-idempotency had zero runtime coverage. `Stripe.webhooks.constructEvent` runs for real
 * here (see the mock above), so a genuinely wrong or missing signature is what actually gets
 * rejected, not a stand-in.
 */
describe('POST /webhooks/stripe', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let adminToken: string;
  const webhookSecret = 'whsec_test_' + randomUUID().replace(/-/g, '');

  const sign = (payload: string) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;

    // Configure a real (well-formed) test-mode Stripe secret + this suite's webhook secret and
    // switch the driver on — `activeWebhookSecret()` only returns a secret for whichever driver
    // is currently active, mirroring how the real dashboard flow works.
    await request(server)
      .post('/api/v1/auth/step-up')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'Test-Passw0rd!' })
      .expect(201);
    await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        test: {
          publishableKey: 'pk_test_webhook_suite',
          secretKey: 'sk_test_webhook_suite_key',
          webhookSecret,
        },
        activeDriver: 'stripe_test',
      })
      .expect(200);
  });

  afterAll(async () => {
    // restore the simulator so other test files' payment flows are unaffected — same convention
    // payment-config.spec.ts follows.
    await request(server)
      .post('/api/v1/auth/step-up')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'Test-Passw0rd!' })
      .expect(201);
    await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'simulator' })
      .expect(200);
    await closeTestApp();
  });

  const eventPayload = (type: string) =>
    JSON.stringify({
      id: `evt_test_${randomUUID().replace(/-/g, '')}`,
      object: 'event',
      type,
      data: { object: { id: `cus_test_${randomUUID().replace(/-/g, '')}`, object: 'customer' } },
    });

  it('accepts a request carrying a genuinely valid Stripe signature', async () => {
    const payload = eventPayload('customer.created');
    const res = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload)
      .expect(200);
    expect(res.body).toEqual({ received: true, handled: true });
  });

  it('rejects a request with no stripe-signature header at all', async () => {
    const payload = eventPayload('customer.created');
    const res = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(422);
    expect(res.body.code).toBe('validation_failed');
  });

  it('rejects a request whose signature does not verify (wrong secret / tampered body)', async () => {
    const payload = eventPayload('customer.created');
    const res = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set(
        'stripe-signature',
        'v1=0000000000000000000000000000000000000000000000000000000000000000,t=1700000000',
      )
      .send(payload)
      .expect(422);
    expect(res.body.code).toBe('validation_failed');

    // a signature computed for a *different* body than the one actually sent must also fail —
    // proves the check is over the real bytes, not just "is there a well-formed header".
    const otherPayload = eventPayload('customer.updated');
    const mismatched = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(otherPayload))
      .send(payload)
      .expect(422);
    expect(mismatched.body.code).toBe('validation_failed');
  });

  it('replaying the exact same event id is a no-op the second time (idempotency), not a double-process', async () => {
    const payload = eventPayload('customer.created');
    const sig = sign(payload);

    const first = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
      .expect(200);
    expect(first.body).toEqual({ received: true, handled: true });

    const second = await request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
      .expect(200);
    expect(second.body).toEqual({ received: true, handled: false, replay: true });
  });
  // ---- reconciliation against the ledger: amount AND currency (DEC-036) ----

  async function localIntent(currency: string, amountMinor: number) {
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
    const providerRef = `pi_ccy_${randomUUID().replace(/-/g, '')}`;
    const reservationReference = `RES-WH-${randomUUID().slice(0, 8)}`;
    await db.insert(paymentIntent).values({
      organizationId: org!.id,
      reservationReference,
      purpose: 'booking',
      amountMinor,
      currency,
      state: 'captured',
      provider: 'stripe_test',
      providerRef,
    });
    return { providerRef, reservationReference };
  }

  const succeeded = (providerRef: string, currency: string, amount: number) =>
    JSON.stringify({
      id: `evt_test_${randomUUID().replace(/-/g, '')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: { id: providerRef, object: 'payment_intent', currency, amount_received: amount },
      },
    });

  const post = (payload: string) =>
    request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload)
      .expect(200);

  const exceptionsFor = async (reservationReference: string) =>
    (
      (
        await request(server)
          .get('/api/v1/ops/payments/reconciliation')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body as Array<{ reservationReference: string; kind: string }>
    ).filter((e) => e.reservationReference === reservationReference);

  it('a payment that agrees with the ledger in amount and currency raises nothing', async () => {
    const { providerRef, reservationReference } = await localIntent('EUR', 5000);
    await post(succeeded(providerRef, 'eur', 5000));
    expect(await exceptionsFor(reservationReference)).toEqual([]);
  });

  it('a payment in a different currency than the ledger is its own exception, not an amount mismatch', async () => {
    // 5000 of one currency is not 5000 of another — comparing the numbers would say "fine"
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    await post(succeeded(providerRef, 'eur', 5000));
    expect((await exceptionsFor(reservationReference)).map((e) => e.kind)).toEqual([
      'currency_mismatch',
    ]);
  });

  it('a payment for a different amount is still an amount mismatch', async () => {
    const { providerRef, reservationReference } = await localIntent('JPY', 5000);
    await post(succeeded(providerRef, 'jpy', 4900));
    expect((await exceptionsFor(reservationReference)).map((e) => e.kind)).toEqual([
      'amount_mismatch',
    ]);
  });

  // ---- a failed delivery is retried, never swallowed (DEC-039) ----

  const rawPost = (payload: string) =>
    request(server)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload);

  const eventIdOf = (payload: string) => (JSON.parse(payload) as { id: string }).id;

  it('an event whose first delivery failed is processed when Stripe retries it — not answered "already handled"', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const payload = succeeded(providerRef, 'usd', 4900); // disagrees with the ledger → needs an exception
    const payments = app.get(PaymentService);
    const spy = vi
      .spyOn(payments, 'openReconciliationException')
      .mockRejectedValueOnce(new Error('transient database error'));

    const first = await rawPost(payload);
    expect(first.status).toBe(500); // Stripe will retry this
    expect(await exceptionsFor(reservationReference)).toEqual([]);

    // Stripe's retry of the very same event: this used to come back `{ handled: false, replay: true }`
    // (our own stored failure, replayed as success) and the exception was never raised.
    const retry = await rawPost(payload).expect(200);
    expect(retry.body).toEqual({ received: true, handled: true });
    expect((await exceptionsFor(reservationReference)).map((e) => e.kind)).toEqual([
      'amount_mismatch',
    ]);
    spy.mockRestore();

    // …and once it HAS been handled, a further re-send is a genuine no-op
    const again = await rawPost(payload).expect(200);
    expect(again.body).toEqual({ received: true, handled: false, replay: true });
    expect(await exceptionsFor(reservationReference)).toHaveLength(1);
  });

  it('two simultaneous retries of a failed event process it exactly once', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const payload = succeeded(providerRef, 'usd', 4900);
    const spy = vi
      .spyOn(app.get(PaymentService), 'openReconciliationException')
      .mockRejectedValueOnce(new Error('transient database error'));
    expect((await rawPost(payload)).status).toBe(500);

    const [a, b] = await Promise.all([rawPost(payload), rawPost(payload)]);
    spy.mockRestore();
    // one wins the claim; the other is refused (409, Stripe retries) or sees the finished run (replay)
    const outcomes = [a, b].map((r) =>
      r.status === 200 ? (r.body.replay ? 'replay' : 'handled') : r.status,
    );
    expect(outcomes.filter((o) => o === 'handled')).toHaveLength(1);
    expect(outcomes.filter((o) => o !== 'handled').every((o) => o === 'replay' || o === 409)).toBe(
      true,
    );
    expect(await exceptionsFor(reservationReference)).toHaveLength(1); // never processed twice
  });

  it('a claim abandoned mid-flight (the process died) is taken over after the lease — a live one is not', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const payload = succeeded(providerRef, 'usd', 4900);
    const key = eventIdOf(payload);
    await db.insert(idempotencyKey).values({
      actorKey: 'stripe-webhook',
      operation: 'stripe.event',
      key,
      requestFingerprint: app
        .get(IdempotencyService)
        .fingerprint({ type: 'payment_intent.succeeded' }),
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    // just made: another delivery is presumably still working on it — refuse (Stripe retries later)
    const live = await rawPost(payload);
    expect(live.status).toBe(409);
    expect(await exceptionsFor(reservationReference)).toEqual([]);

    // older than the lease: whoever made it is gone — process it
    await db
      .update(idempotencyKey)
      .set({ updatedAt: sql`now() - interval '10 minutes'` })
      .where(eq(idempotencyKey.key, key));
    const takeover = await rawPost(payload).expect(200);
    expect(takeover.body).toEqual({ received: true, handled: true });
    expect((await exceptionsFor(reservationReference)).map((e) => e.kind)).toEqual([
      'amount_mismatch',
    ]);
  });

  it('a delivery that already succeeded is never re-run by the retry path', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const payload = succeeded(providerRef, 'usd', 4900);
    await rawPost(payload).expect(200);
    await rawPost(payload).expect(200);
    await rawPost(payload).expect(200);
    expect(await exceptionsFor(reservationReference)).toHaveLength(1);
  });

  // ---- card disputes / chargebacks (FR-PAY-008, DEC-039) ----

  const DUE_BY = 1_790_000_000; // seconds — an evidence deadline in the future
  const disputeEvent = (
    type: string,
    providerRef: string | null,
    disputeId: string,
    over: Record<string, unknown> = {},
  ) =>
    JSON.stringify({
      id: `evt_test_${randomUUID().replace(/-/g, '')}`,
      object: 'event',
      type,
      data: {
        object: {
          id: disputeId,
          object: 'dispute',
          charge: 'ch_test_dispute',
          payment_intent: providerRef,
          amount: 5000,
          currency: 'usd',
          reason: 'fraudulent',
          status: 'needs_response',
          evidence_details: { due_by: DUE_BY },
          ...over,
        },
      },
    });

  type ExceptionRow = {
    id: string;
    reservationReference: string;
    kind: string;
    ledgerAmountMinor: number | null;
    providerAmountMinor: number | null;
    detail: {
      disputeId: string;
      reason: string;
      status: string;
      dueBy: string;
      lastEvent: string;
    } | null;
  };
  const openFor = async (reservationReference: string) =>
    (
      (
        await request(server)
          .get('/api/v1/ops/payments/reconciliation')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body as ExceptionRow[]
    ).filter((e) => e.reservationReference === reservationReference);

  it('a dispute raised at the card network puts ONE exception in front of finance, with the reason and the deadline', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const disputeId = `dp_${randomUUID().replace(/-/g, '')}`;
    const created = disputeEvent('charge.dispute.created', providerRef, disputeId);
    const res = await post(created);
    expect(res.body).toEqual({ received: true, handled: true });

    const [exc, ...rest] = await openFor(reservationReference);
    expect(rest).toEqual([]);
    expect(exc!.kind).toBe('dispute');
    expect(exc!.providerAmountMinor).toBe(5000); // the disputed amount
    expect(exc!.ledgerAmountMinor).toBeNull(); // a dispute has no "difference" to compute
    expect(exc!.detail).toMatchObject({
      disputeId,
      reason: 'fraudulent',
      status: 'needs_response',
      dueBy: new Date(DUE_BY * 1000).toISOString(),
      lastEvent: 'charge.dispute.created',
    });

    // Stripe re-sending the same event changes nothing
    const replay = await post(created);
    expect(replay.body).toEqual({ received: true, handled: false, replay: true });
    expect(await openFor(reservationReference)).toHaveLength(1);
  });

  it('the ledger is never edited by a dispute — the payment stays exactly as recorded', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    await post(
      disputeEvent('charge.dispute.created', providerRef, `dp_${randomUUID().replace(/-/g, '')}`),
    );
    const [row] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.providerRef, providerRef));
    expect(row).toMatchObject({
      state: 'captured',
      amountMinor: 5000,
      refundedMinor: 0,
      reservationReference,
    });
  });

  it('later events for the same dispute refresh its one open exception instead of piling up new ones', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const disputeId = `dp_${randomUUID().replace(/-/g, '')}`;
    await post(disputeEvent('charge.dispute.created', providerRef, disputeId));
    await post(
      disputeEvent('charge.dispute.updated', providerRef, disputeId, { status: 'under_review' }),
    );
    let open = await openFor(reservationReference);
    expect(open).toHaveLength(1);
    expect(open[0]!.detail).toMatchObject({
      status: 'under_review',
      lastEvent: 'charge.dispute.updated',
    });

    await post(
      disputeEvent('charge.dispute.funds_withdrawn', providerRef, disputeId, {
        status: 'under_review',
      }),
    );
    await post(disputeEvent('charge.dispute.closed', providerRef, disputeId, { status: 'lost' }));
    open = await openFor(reservationReference);
    expect(open).toHaveLength(1);
    expect(open[0]!.detail).toMatchObject({ status: 'lost', lastEvent: 'charge.dispute.closed' });
  });

  it('once finance has resolved a dispute, a further event for it is new information and opens a fresh exception', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    const disputeId = `dp_${randomUUID().replace(/-/g, '')}`;
    await post(disputeEvent('charge.dispute.created', providerRef, disputeId));
    const [first] = await openFor(reservationReference);
    await request(server)
      .post(`/api/v1/ops/payments/reconciliation/${first!.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Evidence submitted in the Stripe dashboard' })
      .expect(201);
    expect(await openFor(reservationReference)).toEqual([]);

    await post(disputeEvent('charge.dispute.closed', providerRef, disputeId, { status: 'lost' }));
    const open = await openFor(reservationReference);
    expect(open).toHaveLength(1);
    expect(open[0]!.id).not.toBe(first!.id);
    expect(open[0]!.detail).toMatchObject({ status: 'lost' });
  });

  it('two different disputes on one payment are two exceptions', async () => {
    const { providerRef, reservationReference } = await localIntent('USD', 5000);
    await post(
      disputeEvent('charge.dispute.created', providerRef, `dp_${randomUUID().replace(/-/g, '')}`),
    );
    await post(
      disputeEvent('charge.dispute.created', providerRef, `dp_${randomUUID().replace(/-/g, '')}`),
    );
    expect(await openFor(reservationReference)).toHaveLength(2);
  });

  it('a dispute we cannot attach to a payment is acknowledged and ignored, not an error Stripe would retry forever', async () => {
    const before = (
      await request(server)
        .get('/api/v1/ops/payments/reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body as unknown[];
    const unknown = await post(
      disputeEvent(
        'charge.dispute.created',
        'pi_we_never_created',
        `dp_${randomUUID().replace(/-/g, '')}`,
      ),
    );
    expect(unknown.body).toEqual({ received: true, handled: true });
    const noIntent = await post(
      disputeEvent('charge.dispute.created', null, `dp_${randomUUID().replace(/-/g, '')}`),
    );
    expect(noIntent.body).toEqual({ received: true, handled: true });
    const after = (
      await request(server)
        .get('/api/v1/ops/payments/reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body as unknown[];
    expect(after).toHaveLength(before.length);
  });

  it('a dispute on a zero-decimal currency carries its amount through unchanged', async () => {
    const { providerRef, reservationReference } = await localIntent('JPY', 5000);
    await post(
      disputeEvent('charge.dispute.created', providerRef, `dp_${randomUUID().replace(/-/g, '')}`, {
        currency: 'jpy',
        amount: 5000,
      }),
    );
    const [exc] = await openFor(reservationReference);
    expect(exc).toMatchObject({ kind: 'dispute', providerAmountMinor: 5000 });
  });

  // ---- a payment still waiting on the customer's bank challenge (3-D Secure, DEC-040) ----

  async function pendingChallengeIntent() {
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
    const providerRef = `pi_sca_${randomUUID().replace(/-/g, '')}`;
    const reservationReference = `RES-SCA-${randomUUID().slice(0, 8)}`;
    await db.insert(paymentIntent).values({
      organizationId: org!.id,
      reservationReference,
      purpose: 'booking',
      amountMinor: 5000,
      currency: 'USD',
      state: 'requires_action', // the bank asked the customer to authenticate — no failure code
      provider: 'stripe_test',
      providerRef,
    });
    return { providerRef, reservationReference };
  }
  const intentEvent = (type: string, providerRef: string) =>
    JSON.stringify({
      id: `evt_test_${randomUUID().replace(/-/g, '')}`,
      object: 'event',
      type,
      data: { object: { id: providerRef, object: 'payment_intent', currency: 'usd' } },
    });

  it('a customer who fails or abandons their bank challenge is not a ledger disagreement', async () => {
    const failed = await pendingChallengeIntent();
    await post(intentEvent('payment_intent.payment_failed', failed.providerRef));
    expect(await exceptionsFor(failed.reservationReference)).toEqual([]);

    const cancelled = await pendingChallengeIntent();
    await post(intentEvent('payment_intent.canceled', cancelled.providerRef));
    expect(await exceptionsFor(cancelled.reservationReference)).toEqual([]);
  });

  it('…but Stripe reporting a payment SUCCEEDED while the ledger still says pending is a real disagreement', async () => {
    const { providerRef, reservationReference } = await pendingChallengeIntent();
    await post(intentEvent('payment_intent.succeeded', providerRef));
    expect((await exceptionsFor(reservationReference)).map((e) => e.kind)).toEqual([
      'missing_in_ledger',
    ]);
  });
});
