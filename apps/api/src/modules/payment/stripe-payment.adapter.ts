import Stripe from 'stripe';

import {
  PaymentDeclinedError,
  PaymentPort,
  PaymentProviderConfigError,
  PaymentTimeoutError,
  type AuthorizeInput,
  type PaymentResult,
} from './payment.port';

/**
 * The real Stripe implementation of `PaymentPort` (FR-PAY-010). Constructed with an already-
 * configured `Stripe` client (see `payment-config.service.ts` for how the active secret key is
 * resolved and decrypted) rather than reading credentials itself — keeps this class trivially
 * unit-testable against a mocked client and ignorant of where the key came from or which mode
 * (test/live) it belongs to.
 *
 * Card data never reaches our servers: `token` here is always a Stripe PaymentMethod id created
 * client-side by Stripe.js/Elements (never a raw card number), matching this port's existing
 * "opaque token" contract exactly — the simulator's fake tokens and Stripe's real PaymentMethod
 * ids are interchangeable from every caller's point of view.
 *
 * Known, disclosed scope boundary: a PaymentIntent that comes back `requires_action` (3-D Secure
 * / SCA challenge) is treated as a decline with failureCode `requires_action` rather than driving
 * a client-side confirmation redirect — that needs a materially different multi-step checkout
 * (create → client confirms/redirects → server verifies) that this system's current single-
 * request confirm flow doesn't have. No money moves either way; the guest sees a clear "try a
 * different card" outcome instead of a silent hang.
 */
export class StripePaymentAdapter extends PaymentPort {
  constructor(private readonly stripe: Stripe) {
    super();
  }

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    try {
      const intent = input.reuse
        ? await this.stripe.paymentIntents.create(
            {
              amount: input.amountMinor,
              currency: input.currency.toLowerCase(),
              customer: input.reuse.customerRef,
              payment_method: input.reuse.methodRef,
              off_session: true,
              confirm: true,
              capture_method: 'manual',
              metadata: { reservationReference: input.reference },
            },
            { idempotencyKey: input.idempotencyKey },
          )
        : await this.stripe.paymentIntents.create(
            {
              amount: input.amountMinor,
              currency: input.currency.toLowerCase(),
              payment_method: input.token,
              confirm: true,
              capture_method: 'manual',
              ...(input.saveForReuse
                ? { customer: await this.customerFor(input), setup_future_usage: 'off_session' }
                : {}),
              metadata: { reservationReference: input.reference },
            },
            { idempotencyKey: input.idempotencyKey },
          );

      if (intent.status === 'requires_action' || intent.status === 'requires_confirmation') {
        throw new PaymentDeclinedError('requires_action');
      }
      if (intent.status !== 'requires_capture' && intent.status !== 'succeeded') {
        throw new PaymentDeclinedError(intent.status);
      }

      const pm = intent.payment_method;
      const { brand, last4 } = await this.methodDetails(pm);
      return {
        providerRef: intent.id,
        brand,
        last4,
        customerRef: input.reuse
          ? input.reuse.customerRef
          : input.saveForReuse
            ? ((intent.customer as string | null) ?? null)
            : null,
        methodRef: input.reuse ? input.reuse.methodRef : input.saveForReuse ? (pm as string) : null,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async capture(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
  ): Promise<PaymentResult> {
    try {
      // Spread an empty array rather than pass `undefined` as a third positional argument when
      // there's no key — an explicit `undefined` is still a real argument (observable to a mock's
      // exact-arguments assertion, and to Stripe's SDK), not the same as omitting it.
      const intent = await this.stripe.paymentIntents.capture(
        providerRef,
        { amount_to_capture: amountMinor },
        ...(idempotencyKey ? [{ idempotencyKey }] : []),
      );
      const { brand, last4 } = await this.methodDetails(intent.payment_method);
      return { providerRef: intent.id, brand, last4 };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async void(providerRef: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(providerRef);
    } catch (err) {
      // a void is already a best-effort cleanup step upstream (see payment.service.ts's own
      // `.catch(() => undefined)` around it) — a Stripe intent that's already canceled/captured
      // isn't a new failure worth surfacing, but anything else still is.
      const mapped = this.mapError(err);
      if (mapped instanceof PaymentDeclinedError && mapped.failureCode === 'already_settled')
        return;
      throw mapped;
    }
  }

  async refund(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
  ): Promise<PaymentResult> {
    try {
      const refund = await this.stripe.refunds.create(
        { payment_intent: providerRef, amount: amountMinor },
        ...(idempotencyKey ? [{ idempotencyKey }] : []),
      );
      const intent = await this.stripe.paymentIntents.retrieve(providerRef);
      const { brand, last4 } = await this.methodDetails(intent.payment_method);
      return { providerRef: refund.id, brand, last4 };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  /** Verifies the configured secret key is live and usable — a cheap, read-only, side-effect-
   *  free call (SCREEN-OPS-041's "validate before save," FR-PAY-010) so a mistyped or revoked
   *  key is caught the moment an operator saves it, not the moment a guest's card is on the
   *  line. Throws `PaymentProviderConfigError` on anything other than success. */
  async verifyKey(): Promise<void> {
    try {
      await this.stripe.balance.retrieve();
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private async customerFor(input: AuthorizeInput): Promise<string> {
    const customer = await this.stripe.customers.create({
      metadata: { reservationReference: input.reference },
    });
    return customer.id;
  }

  private async methodDetails(
    pm: string | Stripe.PaymentMethod | null,
  ): Promise<{ brand: string; last4: string }> {
    if (!pm) return { brand: 'unknown', last4: '0000' };
    const method = typeof pm === 'string' ? await this.stripe.paymentMethods.retrieve(pm) : pm;
    return {
      brand: method.card?.brand ?? 'unknown',
      last4: method.card?.last4 ?? '0000',
    };
  }

  /**
   * Matched on Stripe's own documented, stable `error.type` taxonomy
   * (https://stripe.com/docs/api/errors#errors-type) rather than `instanceof Stripe.errors.X` —
   * every real Stripe error carries this field, it's part of Stripe's own public API contract
   * (unlike the SDK's internal class hierarchy, which is an implementation detail), and it makes
   * this method exercisable in a test with a plain `{ type: '...' }` object instead of needing to
   * construct real SDK error instances.
   */
  private mapError(err: unknown): Error {
    const type = (err as { type?: string } | null)?.type;
    const message = err instanceof Error ? err.message : String(err);
    if (type === 'authentication_error') {
      return new PaymentProviderConfigError(`Stripe rejected the configured API key: ${message}`);
    }
    if (type === 'api_connection_error' || type === 'api_error') {
      return new PaymentTimeoutError();
    }
    if (type === 'card_error') {
      const e = err as { decline_code?: string; code?: string };
      return new PaymentDeclinedError(e.decline_code ?? e.code ?? 'card_declined');
    }
    if (type === 'invalid_request_error') {
      const e = err as { code?: string };
      if (e.code === 'payment_intent_unexpected_state')
        return new PaymentDeclinedError('already_settled');
      return new PaymentDeclinedError(e.code ?? 'invalid_request');
    }
    if (type === 'rate_limit_error' || type === 'idempotency_error') {
      return new PaymentDeclinedError(type);
    }
    if (err instanceof Error) return err;
    return new Error(message);
  }
}
