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
          confirm: true,
          capture_method: 'manual',
        }),
        { idempotencyKey: 'res-1:booking' },
      );
      expect(result).toEqual({
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
      expect(result).toEqual({ providerRef: 'pi_1', brand: 'visa', last4: '4242' });
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
});
