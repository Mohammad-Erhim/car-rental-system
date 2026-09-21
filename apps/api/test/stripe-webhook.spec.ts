import { randomUUID } from 'node:crypto';

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

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { organization } from '../src/database/schema/org';
import { paymentIntent } from '../src/database/schema/payment';

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
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let adminToken: string;
  const webhookSecret = 'whsec_test_' + randomUUID().replace(/-/g, '');

  const sign = (payload: string) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

  beforeAll(async () => {
    const app = await getTestApp();
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
});
