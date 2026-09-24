import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import {
  PaymentDeclinedError,
  PaymentProviderConfigError,
  PaymentTimeoutError,
} from './payment.port';
import { StripePaymentAdapter } from './stripe-payment.adapter';

/**
 * A minimal fake of the one slice of the Stripe SDK this adapter touches — no network, no real
 * SDK instance. Each method is a vi.fn() the tests configure per case, so these tests prove the
 * adapter builds the *correct request shape* and maps every response/error the way this port's
 * contract requires, against Stripe's own documented API — the boundary this adapter is actually
 * responsible for getting right. (Genuine confidence that Stripe's real API behaves exactly as
 * documented needs a live test-mode key, which this suite deliberately doesn't require.)
 */
function fakeStripe(overrides: Record<string, unknown> = {}) {
  return {
    paymentIntents: {
      create: vi.fn(),
      capture: vi.fn(),
      cancel: vi.fn(),
      retrieve: vi.fn(),
    },
    refunds: { create: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    customers: { create: vi.fn() },
    balance: { retrieve: vi.fn() },
    ...overrides,
  };
}

function adapterFor(stripe: ReturnType<typeof fakeStripe>) {
  return new StripePaymentAdapter(stripe as unknown as Stripe);
}

const card = { brand: 'visa', last4: '4242' };

describe('StripePaymentAdapter', () => {
  describe('authorize', () => {
    it('a fresh token creates a confirmed, manual-capture PaymentIntent, idempotency-keyed', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_1',
        status: 'requires_capture',
        payment_method: 'pm_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const adapter = adapterFor(stripe);

      const result = await adapter.authorize({
        idempotencyKey: 'res-1:booking',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_test_123',
        reference: 'res-1',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: 'usd',
          payment_method: 'pm_test_123',
          // pinned to card — leaving this unset lets Stripe fall back to the account's automatic
          // payment methods (bank/Klarna/etc.), which then requires a return_url this
          // single-request server-side confirm never provides.
          payment_method_types: ['card'],
          confirm: true,
          capture_method: 'manual',
        }),
        { idempotencyKey: 'res-1:booking' },
      );
      expect(result).toEqual({
        provider: 'stripe_test',
        providerRef: 'pi_1',
        brand: 'visa',
        last4: '4242',
        customerRef: null,
        methodRef: null,
      });
    });

    it('saveForReuse creates a Stripe customer first and returns customer + method refs', async () => {
      const stripe = fakeStripe();
      stripe.customers.create.mockResolvedValue({ id: 'cus_1' });
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_2',
        status: 'requires_capture',
        payment_method: 'pm_1',
        customer: 'cus_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const adapter = adapterFor(stripe);

      const result = await adapter.authorize({
        idempotencyKey: 'res-2:booking',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_test_456',
        reference: 'res-2',
        saveForReuse: true,
      });

      expect(stripe.customers.create).toHaveBeenCalledOnce();
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_1', setup_future_usage: 'off_session' }),
        expect.anything(),
      );
      expect(result.customerRef).toBe('cus_1');
      expect(result.methodRef).toBe('pm_1');
    });

    it('a `reuse` charge is off-session against the saved customer + method, no new customer created', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_3',
        status: 'requires_capture',
        payment_method: 'pm_saved',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const adapter = adapterFor(stripe);

      const result = await adapter.authorize({
        idempotencyKey: 'res-1:extension',
        amountMinor: 2000,
        currency: 'USD',
        reference: 'res-1',
        reuse: { customerRef: 'cus_1', methodRef: 'pm_saved' },
      });

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          payment_method: 'pm_saved',
          off_session: true,
          confirm: true,
        }),
        { idempotencyKey: 'res-1:extension' },
      );
      expect(result.customerRef).toBe('cus_1');
      expect(result.methodRef).toBe('pm_saved');
    });

    it('a PaymentIntent left `requires_action` (3-D Secure) is a decline, not a silent hang', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_4', status: 'requires_action' });
      const adapter = adapterFor(stripe);

      await expect(
        adapter.authorize({
          idempotencyKey: 'res-3:booking',
          amountMinor: 5000,
          currency: 'USD',
          token: 'pm_3ds',
          reference: 'res-3',
        }),
      ).rejects.toBeInstanceOf(PaymentDeclinedError);
    });

    it('a Stripe card_error maps to PaymentDeclinedError with the decline code', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockRejectedValue({
        type: 'StripeCardError',
        decline_code: 'insufficient_funds',
        message: 'Your card has insufficient funds.',
      });
      const adapter = adapterFor(stripe);

      const err = await adapter
        .authorize({
          idempotencyKey: 'k',
          amountMinor: 100,
          currency: 'USD',
          token: 'pm_x',
          reference: 'res-4',
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(PaymentDeclinedError);
      expect(err.failureCode).toBe('insufficient_funds');
    });

    it('a Stripe api_connection_error maps to PaymentTimeoutError (unknown outcome, not a decline)', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockRejectedValue({
        type: 'StripeConnectionError',
        message: 'network unreachable',
      });
      const adapter = adapterFor(stripe);

      await expect(
        adapter.authorize({
          idempotencyKey: 'k',
          amountMinor: 100,
          currency: 'USD',
          token: 'pm_x',
          reference: 'res-5',
        }),
      ).rejects.toBeInstanceOf(PaymentTimeoutError);
    });

    it('a Stripe authentication_error (bad API key) is OUR misconfiguration, not a card decline', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockRejectedValue({
        type: 'StripeAuthenticationError',
        message: 'Invalid API Key provided',
      });
      const adapter = adapterFor(stripe);

      const err = await adapter
        .authorize({
          idempotencyKey: 'k',
          amountMinor: 100,
          currency: 'USD',
          token: 'pm_x',
          reference: 'res-6',
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(PaymentProviderConfigError);
    });

    it('a Stripe idempotency_error (reused key, different request) maps to a clean decline reason', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockRejectedValue({
        type: 'StripeIdempotencyError',
        message: 'Keys for idempotent requests can only be used with the same parameters',
      });
      const adapter = adapterFor(stripe);

      const err = await adapter
        .authorize({
          idempotencyKey: 'k',
          amountMinor: 100,
          currency: 'USD',
          token: 'pm_x',
          reference: 'res-7',
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(PaymentDeclinedError);
      // the raw SDK class name must never leak to the customer-facing reason
      expect(err.failureCode).toBe('idempotency_error');
    });
  });

  describe('capture / void / refund', () => {
    it('capture passes amount_to_capture and reads the method back for brand/last4', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.capture.mockResolvedValue({ id: 'pi_1', payment_method: 'pm_1' });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const adapter = adapterFor(stripe);

      const result = await adapter.capture('pi_1', 5000);
      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith('pi_1', {
        amount_to_capture: 5000,
      });
      expect(result).toEqual({
        provider: 'stripe_test',
        providerRef: 'pi_1',
        brand: 'visa',
        last4: '4242',
      });
    });

    it('void cancels the intent; a "already settled" error is swallowed as a best-effort no-op', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.cancel.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        code: 'payment_intent_unexpected_state',
        message: 'already captured',
      });
      const adapter = adapterFor(stripe);

      await expect(adapter.void('pi_1')).resolves.toBeUndefined();
    });

    it('void re-throws any other error', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.cancel.mockRejectedValue({
        type: 'StripeConnectionError',
        message: 'down',
      });
      const adapter = adapterFor(stripe);

      await expect(adapter.void('pi_1')).rejects.toBeInstanceOf(PaymentTimeoutError);
    });

    it('refund creates a Stripe refund against the intent for the given amount', async () => {
      const stripe = fakeStripe();
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });
      stripe.paymentIntents.retrieve.mockResolvedValue({ payment_method: 'pm_1' });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const adapter = adapterFor(stripe);

      const result = await adapter.refund('pi_1', 2000);
      expect(stripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_1',
        amount: 2000,
      });
      expect(result.providerRef).toBe('re_1');
    });

    it('a refund carries ids only, so it can be traced back to our ledger', async () => {
      const stripe = fakeStripe();
      stripe.refunds.create.mockResolvedValue({ id: 're_2' });
      stripe.paymentIntents.retrieve.mockResolvedValue({ payment_method: 'pm_1' });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });

      await new StripePaymentAdapter(stripe as unknown as Stripe, 'live', 'production').refund(
        'pi_1',
        2000,
        'refund:abc',
        { reservationReference: 'RES-1', paymentIntentId: 'intent-uuid', purpose: 'booking' },
      );
      expect(stripe.refunds.create).toHaveBeenCalledWith(
        {
          payment_intent: 'pi_1',
          amount: 2000,
          metadata: {
            source: 'carrental',
            env: 'production',
            reservation_reference: 'RES-1',
            payment_id: 'intent-uuid',
            purpose: 'booking',
          },
        },
        { idempotencyKey: 'refund:abc' },
      );
    });
  });

  describe('what Stripe is told about a payment', () => {
    const context = {
      reservationReference: 'RES-7',
      paymentIntentId: 'intent-uuid',
      purpose: 'extension-1789960642317',
      customerId: 'acct-uuid',
      channel: 'customer',
      quoteReference: 'Q-9',
      environment: 'production',
    };

    it('sends stable identifiers and a short description — nothing that can change', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_m',
        status: 'requires_capture',
        payment_method: 'pm_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });

      await adapterFor(stripe).authorize({
        idempotencyKey: 'k',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_x',
        reference: 'RES-7',
        context,
      });

      const [body] = stripe.paymentIntents.create.mock.calls[0]!;
      expect(body.description).toBe('Extension RES-7');
      expect(body.metadata).toEqual({
        source: 'carrental',
        env: 'production',
        reservation_reference: 'RES-7',
        payment_id: 'intent-uuid',
        // the uniqueness suffix of our own purpose key means nothing to Stripe
        purpose: 'extension',
        customer_id: 'acct-uuid',
        channel: 'customer',
        quote_reference: 'Q-9',
      });
      // nothing personal or mutable rides along
      const sent = JSON.stringify(body);
      for (const forbidden of ['email', 'name', 'phone', 'plate', 'pickup', 'location']) {
        expect(sent.toLowerCase()).not.toContain(forbidden);
      }
    });

    it('marks a guest checkout as "guest" and leaves out what is unknown', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_g',
        status: 'requires_capture',
        payment_method: 'pm_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });

      await adapterFor(stripe).authorize({
        idempotencyKey: 'k',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_x',
        reference: 'RES-8',
        context: { ...context, customerId: null, channel: null, quoteReference: null },
      });
      const [body] = stripe.paymentIntents.create.mock.calls[0]!;
      expect(body.metadata.customer_id).toBe('guest');
      expect(body.metadata).not.toHaveProperty('channel');
      expect(body.metadata).not.toHaveProperty('quote_reference');
    });

    it('the saved-card Stripe customer gets ids only — no name, email or phone', async () => {
      const stripe = fakeStripe();
      stripe.customers.create.mockResolvedValue({ id: 'cus_9' });
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_c',
        status: 'requires_capture',
        payment_method: 'pm_1',
        customer: 'cus_9',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });

      await adapterFor(stripe).authorize({
        idempotencyKey: 'k',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_x',
        reference: 'RES-7',
        saveForReuse: true,
        context,
      });
      expect(stripe.customers.create).toHaveBeenCalledWith({
        metadata: {
          source: 'carrental',
          env: 'production',
          customer_id: 'acct-uuid',
          reservation_reference: 'RES-7',
        },
      });
    });

    it('records whether the client was built from the live or the test key set', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_l',
        status: 'requires_capture',
        payment_method: 'pm_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      const live = new StripePaymentAdapter(stripe as unknown as Stripe, 'live');
      const res = await live.authorize({
        idempotencyKey: 'k',
        amountMinor: 5000,
        currency: 'USD',
        token: 'pm_x',
        reference: 'RES-7',
      });
      expect(res.provider).toBe('stripe_live');
    });
  });

  describe('currency handling', () => {
    it('sends a zero-decimal currency as-is, lower-cased', async () => {
      const stripe = fakeStripe();
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_j',
        status: 'requires_capture',
        payment_method: 'pm_1',
      });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card });
      await adapterFor(stripe).authorize({
        idempotencyKey: 'k',
        amountMinor: 12000,
        currency: 'JPY',
        token: 'pm_x',
        reference: 'RES-J',
      });
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 12000, currency: 'jpy' }),
        expect.anything(),
      );
    });

    it('refuses a currency outside the supported catalogue before calling Stripe', async () => {
      const stripe = fakeStripe();
      await expect(
        adapterFor(stripe).authorize({
          idempotencyKey: 'k',
          amountMinor: 5000,
          currency: 'KWD',
          token: 'pm_x',
          reference: 'RES-K',
        }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyKey', () => {
    it('resolves on a successful balance retrieve', async () => {
      const stripe = fakeStripe();
      stripe.balance.retrieve.mockResolvedValue({ object: 'balance' });
      await expect(adapterFor(stripe).verifyKey()).resolves.toBeUndefined();
    });

    it('throws PaymentProviderConfigError for a bad key', async () => {
      const stripe = fakeStripe();
      stripe.balance.retrieve.mockRejectedValue({
        type: 'StripeAuthenticationError',
        message: 'Invalid API Key provided',
      });
      await expect(adapterFor(stripe).verifyKey()).rejects.toBeInstanceOf(
        PaymentProviderConfigError,
      );
    });
  });

  // ---- 3-D Secure / SCA (DEC-040) ----
  describe('3-D Secure', () => {
    const authInput = (over: Record<string, unknown> = {}) => ({
      idempotencyKey: 'res-9:booking:pm_3ds',
      amountMinor: 5000,
      currency: 'EUR',
      token: 'pm_3ds',
      reference: 'res-9',
      ...over,
    });

    describe('authorize', () => {
      it('hands the challenge to a caller that can run it: actionRequired + the client secret, nothing captured', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.create.mockResolvedValue({
          id: 'pi_sca',
          status: 'requires_action',
          client_secret: 'pi_sca_secret_abc',
          payment_method: 'pm_3ds',
        });
        const result = await adapterFor(stripe).authorize(authInput({ allowAction: true }));
        expect(result.providerRef).toBe('pi_sca');
        expect(result.actionRequired).toEqual({ clientSecret: 'pi_sca_secret_abc' });
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      });

      it('is still a decline for a caller that cannot (modify / extend / off-session) — even with a client secret to hand', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.create.mockResolvedValue({
          id: 'pi_sca',
          status: 'requires_action',
          client_secret: 'pi_sca_secret_abc',
        });
        const err = await adapterFor(stripe)
          .authorize(authInput())
          .catch((e) => e);
        expect(err).toBeInstanceOf(PaymentDeclinedError);
        expect(err.failureCode).toBe('requires_action');
      });

      it('is a decline when there is no client secret to continue with, even for a caller that could', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_sca', status: 'requires_action' });
        await expect(
          adapterFor(stripe).authorize(authInput({ allowAction: true })),
        ).rejects.toBeInstanceOf(PaymentDeclinedError);
      });

      it('does not change a payment that needs no challenge', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.create.mockResolvedValue({
          id: 'pi_ok',
          status: 'requires_capture',
          payment_method: 'pm_1',
        });
        stripe.paymentMethods.retrieve.mockResolvedValue({ card });
        const result = await adapterFor(stripe).authorize(authInput({ allowAction: true }));
        expect(result.actionRequired).toBeUndefined();
        expect(result.providerRef).toBe('pi_ok');
      });
    });

    describe('resume', () => {
      const intent = (over: Record<string, unknown>) => ({
        id: 'pi_sca',
        status: 'requires_capture',
        payment_method: 'pm_3ds',
        customer: 'cus_1',
        client_secret: 'pi_sca_secret_abc',
        ...over,
      });

      it('finds the authenticated payment (requires_capture) and hands back its details', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({}));
        stripe.paymentMethods.retrieve.mockResolvedValue({ card });
        const out = await adapterFor(stripe).resume('pi_sca', 'pm_3ds');
        expect(out).toEqual({
          kind: 'authorized',
          result: {
            provider: 'stripe_test',
            providerRef: 'pi_sca',
            brand: 'visa',
            last4: '4242',
            customerRef: 'cus_1',
            methodRef: 'pm_3ds',
          },
        });
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      });

      it('treats an already-succeeded payment as authorized', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'succeeded' }));
        stripe.paymentMethods.retrieve.mockResolvedValue({ card });
        expect((await adapterFor(stripe).resume('pi_sca', 'pm_3ds')).kind).toBe('authorized');
      });

      it('asks again, with the same secret, while the customer has not finished', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_action' }));
        expect(await adapterFor(stripe).resume('pi_sca', 'pm_3ds')).toEqual({
          kind: 'action_required',
          clientSecret: 'pi_sca_secret_abc',
        });
      });

      it("a challenge the customer failed is a decline carrying the bank's reason", async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(
          intent({
            status: 'requires_payment_method',
            payment_method: null,
            last_payment_error: { code: 'payment_intent_authentication_failure' },
          }),
        );
        const err = await adapterFor(stripe)
          .resume('pi_sca', 'pm_3ds')
          .catch((e) => e);
        expect(err).toBeInstanceOf(PaymentDeclinedError);
        expect(err.failureCode).toBe('payment_intent_authentication_failure');
      });

      it('a failed challenge with no reason from the bank is `authentication_failed`', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(
          intent({ status: 'requires_payment_method', payment_method: null }),
        );
        const err = await adapterFor(stripe)
          .resume('pi_sca')
          .catch((e) => e);
        expect(err.failureCode).toBe('authentication_failed');
      });

      it('a cancelled payment is gone — authorise afresh', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'canceled' }));
        expect(await adapterFor(stripe).resume('pi_sca', 'pm_3ds')).toEqual({ kind: 'superseded' });
      });

      it('a different card than the one the challenge was for drops that payment and starts over', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_action' }));
        stripe.paymentIntents.cancel.mockResolvedValue({});
        expect(await adapterFor(stripe).resume('pi_sca', 'pm_another_card')).toEqual({
          kind: 'superseded',
        });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_sca');
      });

      it('still supersedes when cancelling the abandoned payment itself fails (it moves no money)', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_action' }));
        stripe.paymentIntents.cancel.mockRejectedValue({ type: 'StripeAPIError', message: 'boom' });
        expect(await adapterFor(stripe).resume('pi_sca', 'pm_another_card')).toEqual({
          kind: 'superseded',
        });
      });

      it('an unexpected status is a decline that names it, never a silent success', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'processing' }));
        const err = await adapterFor(stripe)
          .resume('pi_sca', 'pm_3ds')
          .catch((e) => e);
        expect(err).toBeInstanceOf(PaymentDeclinedError);
        expect(err.failureCode).toBe('processing');
      });

      it('maps a Stripe outage to a timeout and a bad key to a configuration error', async () => {
        const stripe = fakeStripe();
        stripe.paymentIntents.retrieve.mockRejectedValueOnce({
          type: 'StripeConnectionError',
          message: 'x',
        });
        await expect(adapterFor(stripe).resume('pi_sca')).rejects.toBeInstanceOf(
          PaymentTimeoutError,
        );
        stripe.paymentIntents.retrieve.mockRejectedValueOnce({
          type: 'StripeAuthenticationError',
          message: 'x',
        });
        await expect(adapterFor(stripe).resume('pi_sca')).rejects.toBeInstanceOf(
          PaymentProviderConfigError,
        );
      });
    });
  });
});
