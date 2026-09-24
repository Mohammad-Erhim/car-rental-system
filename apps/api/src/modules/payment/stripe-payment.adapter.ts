import { stripeCurrency, toStripeAmount } from '@carrental/i18n';
import Stripe from 'stripe';

import {
  PaymentDeclinedError,
  PaymentPort,
  PaymentProviderConfigError,
  PaymentTimeoutError,
  type AuthorizeInput,
  type PaymentResult,
  type RefundContext,
  type ResumeOutcome,
} from './payment.port';
import {
  customerMetadata,
  paymentDescription,
  paymentMetadata,
  refundMetadata,
} from './stripe-metadata';

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
 * 3-D Secure / SCA (DEC-040): a PaymentIntent that comes back `requires_action` is handed to the
 * caller as `actionRequired` (with the client secret) when the caller said it can take the
 * customer through the bank's challenge (`allowAction` — only the checkout's confirm can); the
 * client completes it with `stripe.handleNextAction`, the checkout is submitted again and
 * `resume` finds the authenticated payment. For every other caller (modify, extend, off-session
 * settlement — no customer in the loop) a challenge is still a decline with failureCode
 * `requires_action`, exactly as before. No money moves until the capture either way.
 */
export class StripePaymentAdapter extends PaymentPort {
  /** `mode` is which of the operator's two key sets this client was built from — recorded on
   *  every payment so test-mode and live charges can be told apart from our own database.
   *  `environment` is the deployment (NODE_ENV) and goes into Stripe metadata. */
  constructor(
    private readonly stripe: Stripe,
    private readonly mode: 'test' | 'live' = 'test',
    private readonly environment = 'production',
  ) {
    super();
  }

  private get provider(): string {
    return `stripe_${this.mode}`;
  }

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    try {
      // `payment_method_types: ['card']` is required, not cosmetic: leaving it unset lets Stripe
      // fall back to the account's automatic-payment-methods config (whatever's enabled in the
      // Dashboard — bank, Klarna, Cash App, …), and confirming a PaymentIntent server-side
      // (`confirm: true`) with any redirect-capable type in play requires a `return_url`, which
      // this single-request confirm flow (see class doc) never provides — Stripe then refuses the
      // confirm with a generic, code-less invalid_request_error. Pinning to card avoids that
      // entirely and matches the Payment Element's own `paymentMethodOrder`/wallet restriction on
      // the frontend (checkout/page.tsx).
      // The amount and currency go through the currency module — never `amountMinor` raw — so a
      // currency Stripe would reject or mis-scale fails here, before any request is made.
      const amount = toStripeAmount(input.amountMinor, input.currency);
      const currency = stripeCurrency(input.currency);
      const ctx = input.context
        ? {
            metadata: paymentMetadata({ ...input.context, environment: this.environment }),
            description: paymentDescription(input.context),
          }
        : { metadata: { source: 'carrental', reservation_reference: input.reference } };
      const intent = input.reuse
        ? await this.stripe.paymentIntents.create(
            {
              amount,
              currency,
              customer: input.reuse.customerRef,
              payment_method: input.reuse.methodRef,
              payment_method_types: ['card'],
              off_session: true,
              confirm: true,
              capture_method: 'manual',
              ...ctx,
            },
            { idempotencyKey: input.idempotencyKey },
          )
        : await this.stripe.paymentIntents.create(
            {
              amount,
              currency,
              payment_method: input.token,
              payment_method_types: ['card'],
              confirm: true,
              capture_method: 'manual',
              ...(input.saveForReuse
                ? { customer: await this.customerFor(input), setup_future_usage: 'off_session' }
                : {}),
              ...ctx,
            },
            { idempotencyKey: input.idempotencyKey },
          );

      if (intent.status === 'requires_action' && input.allowAction && intent.client_secret) {
        // the bank wants the customer to authenticate — nothing is held or charged yet
        return {
          provider: this.provider,
          providerRef: intent.id,
          brand: 'unknown',
          last4: '0000',
          actionRequired: { clientSecret: intent.client_secret },
        };
      }
      if (intent.status === 'requires_action' || intent.status === 'requires_confirmation') {
        throw new PaymentDeclinedError('requires_action');
      }
      if (intent.status !== 'requires_capture' && intent.status !== 'succeeded') {
        throw new PaymentDeclinedError(intent.status);
      }

      const pm = intent.payment_method;
      const { brand, last4 } = await this.methodDetails(pm);
      return {
        provider: this.provider,
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

  async resume(providerRef: string, token?: string): Promise<ResumeOutcome> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(providerRef);
      const pm =
        typeof intent.payment_method === 'string'
          ? intent.payment_method
          : (intent.payment_method?.id ?? null);
      // The customer has since offered a different card: this payment was for the old one. Drop it
      // (best effort — a cancel that fails only leaves an unconfirmed intent that moves no money).
      if (token && pm && pm !== token && intent.status !== 'canceled') {
        await this.void(providerRef).catch(() => undefined);
        return { kind: 'superseded' };
      }
      switch (intent.status) {
        case 'requires_capture':
        case 'succeeded': {
          const { brand, last4 } = await this.methodDetails(intent.payment_method);
          return {
            kind: 'authorized',
            result: {
              provider: this.provider,
              providerRef: intent.id,
              brand,
              last4,
              customerRef: (intent.customer as string | null) ?? null,
              methodRef: pm,
            },
          };
        }
        case 'requires_action':
        case 'requires_confirmation':
          return intent.client_secret
            ? { kind: 'action_required', clientSecret: intent.client_secret }
            : { kind: 'superseded' };
        case 'canceled':
          return { kind: 'superseded' };
        case 'requires_payment_method':
          // the challenge failed, was abandoned, or the bank refused after it — Stripe clears the card
          throw new PaymentDeclinedError(
            intent.last_payment_error?.decline_code ??
              intent.last_payment_error?.code ??
              'authentication_failed',
          );
        default:
          throw new PaymentDeclinedError(intent.status);
      }
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
      return { providerRef: intent.id, brand, last4, provider: this.provider };
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

  async forgetCustomer(customerRef: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerRef);
    } catch (err) {
      // already deleted (or never existed here) — the goal, "Stripe holds nothing", is met
      if ((err as { code?: string } | null)?.code === 'resource_missing') return;
      throw this.mapError(err);
    }
  }

  async refund(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
    context?: RefundContext,
  ): Promise<PaymentResult> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: providerRef,
          amount: amountMinor,
          ...(context
            ? { metadata: refundMetadata({ ...context, environment: this.environment }) }
            : {}),
        },
        ...(idempotencyKey ? [{ idempotencyKey }] : []),
      );
      const intent = await this.stripe.paymentIntents.retrieve(providerRef);
      const { brand, last4 } = await this.methodDetails(intent.payment_method);
      return { providerRef: refund.id, brand, last4, provider: this.provider };
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
    // ids only — no name/email/phone: Stripe doesn't need them to charge a saved card, and they
    // would go stale here the moment the customer edits their profile
    const customer = await this.stripe.customers.create({
      metadata: input.context
        ? customerMetadata({ ...input.context, environment: this.environment })
        : { source: 'carrental', reservation_reference: input.reference },
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
   * Matched on `error.type` — but note this is *not* Stripe's documented API taxonomy string
   * (https://stripe.com/docs/api/errors#errors-type, e.g. `"authentication_error"`). In
   * stripe-node, `StripeError#type` is the SDK's own error *class* name
   * (`"StripeAuthenticationError"`, `"StripeCardError"`, …) — `generateV1Error` in the SDK's
   * `Error.js` dispatches purely on HTTP status code, and the base `StripeError` constructor sets
   * `this.type = type || this.constructor.name` with every subclass passing its own class name.
   * The real API taxonomy string (when Stripe's response included one) lives at `error.rawType` /
   * `error.raw.type` instead, and doesn't reliably correlate 1:1 with the status-code-driven class
   * (e.g. a bad API key came back with `statusCode: 401` → `StripeAuthenticationError`, but
   * `rawType: "invalid_request_error"`) — so status-driven `.type` is the correct thing to branch
   * on here, not `.rawType`. Confirmed against the real SDK (v22.6.2), not just its docs. Plain
   * `instanceof Stripe.errors.X` is avoided so this stays exercisable in a test with a plain
   * `{ type: '...' }` object instead of needing to construct real SDK error instances.
   */
  private mapError(err: unknown): Error {
    const type = (err as { type?: string } | null)?.type;
    const message = err instanceof Error ? err.message : String(err);
    if (type === 'StripeAuthenticationError') {
      return new PaymentProviderConfigError(`Stripe rejected the configured API key: ${message}`);
    }
    if (type === 'StripeConnectionError' || type === 'StripeAPIError') {
      return new PaymentTimeoutError();
    }
    if (type === 'StripeCardError') {
      const e = err as { decline_code?: string; code?: string };
      return new PaymentDeclinedError(e.decline_code ?? e.code ?? 'card_declined');
    }
    if (type === 'StripeInvalidRequestError') {
      const e = err as { code?: string };
      if (e.code === 'payment_intent_unexpected_state')
        return new PaymentDeclinedError('already_settled');
      return new PaymentDeclinedError(e.code ?? 'invalid_request');
    }
    if (type === 'StripeRateLimitError') {
      return new PaymentDeclinedError('rate_limit_error');
    }
    if (type === 'StripeIdempotencyError') {
      return new PaymentDeclinedError('idempotency_error');
    }
    if (err instanceof Error) return err;
    return new Error(message);
  }
}
