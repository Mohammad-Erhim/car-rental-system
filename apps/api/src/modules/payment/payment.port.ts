/**
 * PaymentPort — the boundary to a card processor (SRS-ARC-001 ports pattern, FR-PAY-001..003).
 * Two implementations: a deterministic simulator (card data never enters the system, only an
 * opaque token whose value selects the outcome so error paths are testable) and a real Stripe
 * adapter (stripe-payment.adapter.ts). Which one is *active* is a dashboard-configurable, DB-
 * backed setting (payment-config.service.ts) — never a hardcoded DI binding — so switching
 * between simulator / Stripe test / Stripe live needs no redeploy.
 *
 * Simulator tokens:
 *   tok_ok / tok_visa_...     → authorize + capture succeed
 *   tok_decline               → authorize declines (card_declined)
 *   tok_timeout               → authorize throws a timeout (no definite result)
 *   tok_capture_fail          → authorize ok, capture fails
 *   tok_decline_reuse         → this charge succeeds and saves the method, but any LATER
 *                               off-session reuse of it (extend / return-settlement) declines
 *   tok_3ds                   → the bank asks for a 3-D Secure challenge (DEC-040): `authorize`
 *                               returns `actionRequired`, the customer completes it, and the
 *                               next `resume` finds the payment authorized
 *   tok_3ds_slow              → as tok_3ds, but the first `resume` finds the customer still busy
 *   tok_3ds_fail              → as tok_3ds, but the customer fails the challenge
 *   anything else             → succeeds (treated as a normal token)
 */

import type { PaymentContext } from './stripe-metadata';

export type RefundContext = Pick<
  PaymentContext,
  'reservationReference' | 'paymentIntentId' | 'purpose'
>;

export interface AuthorizeInput {
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  /** a fresh, client-collected payment method reference (a Stripe PaymentMethod id, or a
   *  simulator token) — required unless `reuse` is set. */
  token?: string;
  reference: string;
  /** charge a customer + payment method saved from an earlier charge on the same reservation
   *  off-session, instead of `token` — the extend-hire / incidental-charge path, so a guest is
   *  never asked to re-enter a card for a reservation they've already paid on (FR-PAY-010). */
  reuse?: { customerRef: string; methodRef: string };
  /** true on a reservation's first charge — save the resulting customer + payment method so a
   *  later call can pass `reuse` instead of `token`. */
  saveForReuse?: boolean;
  /** ids the processor should carry so a payment there can be traced back to our records
   *  (stripe-metadata.ts). Optional: the simulator ignores it. */
  context?: PaymentContext;
  /** the caller can send the customer through a bank (3-D Secure) challenge and come back — only
   *  the checkout can. When true and the bank asks for one, the result carries `actionRequired`
   *  instead of the charge being refused; when false (modify / extend / off-session settlement)
   *  a challenge is a decline, exactly as before. */
  allowAction?: boolean;
}

export interface PaymentResult {
  providerRef: string;
  brand: string;
  last4: string;
  /** present when `saveForReuse` was honored (or `reuse` was used, echoing it back) — null when
   *  the active provider doesn't support saved methods (e.g. an old simulator charge). */
  customerRef?: string | null;
  methodRef?: string | null;
  /** which driver handled it: simulator | stripe_test | stripe_live — recorded on the intent so
   *  a support engineer can tell a test-mode charge from a live one without opening Stripe. */
  provider?: string;
  /** set (only when `allowAction` was passed) when the bank wants the customer to authenticate:
   *  nothing is charged or held yet. The client hands `clientSecret` to the processor's SDK
   *  (`stripe.handleNextAction`) and the checkout is submitted again — `resume` then finds the
   *  authenticated payment and it is captured (DEC-040). */
  actionRequired?: { clientSecret: string };
}

/** Where a payment that was waiting on a bank challenge stands now. */
export type ResumeOutcome =
  | { kind: 'authorized'; result: PaymentResult }
  /** the customer has not finished (or has to start the challenge again) */
  | { kind: 'action_required'; clientSecret: string }
  /** that payment is gone — cancelled, never confirmed, or for a different card than the one now
   *  offered: nothing is left to resume, authorise afresh */
  | { kind: 'superseded' };

export class PaymentDeclinedError extends Error {
  constructor(readonly failureCode: string) {
    super(`payment declined: ${failureCode}`);
    this.name = 'PaymentDeclinedError';
  }
}

export class PaymentTimeoutError extends Error {
  constructor() {
    super('payment provider timed out — outcome unknown');
    this.name = 'PaymentTimeoutError';
  }
}

/** Thrown by a live Stripe adapter when the configured secret key itself is invalid/revoked —
 *  distinct from a card decline (that's the *guest's* card; this is *our* configuration) so the
 *  caller can surface "payments are misconfigured," not "your card didn't work." */
export class PaymentProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderConfigError';
  }
}

export abstract class PaymentPort {
  abstract authorize(input: AuthorizeInput): Promise<PaymentResult>;
  /** `idempotencyKey` should be stable per logical capture (e.g. derived from the intent id) so a
   *  concurrent or retried capture on the same intent is deduplicated by the provider instead of
   *  the second call failing "already captured" against an intent the first call already settled. */
  abstract capture(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
  ): Promise<PaymentResult>;
  /** Pick up a payment that `authorize` left waiting on a bank challenge (`actionRequired`).
   *  `token` is the card offered NOW: if it is not the one the challenge was for, the pending
   *  payment is dropped and `superseded` returned. Throws {@link PaymentDeclinedError} when the
   *  challenge failed or the bank refused after it. */
  abstract resume(providerRef: string, token?: string): Promise<ResumeOutcome>;
  abstract void(providerRef: string): Promise<void>;
  /** Delete the processor's record of a customer — and with it every card saved against them — for
   *  a closed account (DEC-041). Idempotent: a customer the processor no longer has is already gone. */
  abstract forgetCustomer(customerRef: string): Promise<void>;
  /** `idempotencyKey` should be stable per logical refund (e.g. derived from the intent id) so a
   *  retried or racing refund call is deduplicated by the provider rather than issuing a second,
   *  real refund. */
  abstract refund(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
    context?: RefundContext,
  ): Promise<PaymentResult>;
}

function brandFor(token: string): { brand: string; last4: string } {
  if (token.includes('amex')) return { brand: 'amex', last4: '0005' };
  if (token.includes('mastercard') || token.includes('mc'))
    return { brand: 'mastercard', last4: '4444' };
  return { brand: 'visa', last4: '4242' };
}

/** How a simulated 3-D Secure challenge plays out (see the token list at the top of this file). */
type ChallengePlan = {
  token: string;
  outcome: 'complete' | 'fail';
  busyOnce: boolean;
  resumes: number;
};

export class SimulatorPaymentAdapter extends PaymentPort {
  private captured = new Set<string>();
  /** Challenges `authorize` opened, by providerRef. Static on purpose: `PaymentConfigService`
   *  builds a fresh simulator for every call, so instance state would be gone by `resume`. */
  private static readonly challenges = new Map<string, ChallengePlan>();

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    // a reuse call carries no fresh token by design — the simulator's "saved method" is just the
    // reuse reference echoed back through `brandFor`, so tests exercise the same shape a real
    // off-session Stripe charge would without needing a real saved card.
    const tokenLike = input.reuse ? input.reuse.methodRef : (input.token ?? '');
    if (tokenLike === 'tok_timeout') throw new PaymentTimeoutError();
    if (tokenLike === 'tok_decline') throw new PaymentDeclinedError('card_declined');
    if (input.reuse && tokenLike === 'tok_decline_reuse') {
      throw new PaymentDeclinedError('card_declined');
    }
    if (input.amountMinor <= 0) throw new PaymentDeclinedError('invalid_amount');
    const { brand, last4 } = brandFor(tokenLike);
    // stable providerRef per idempotency key so a retry of the same key maps to the same auth
    const providerRef = `sim_auth_${hash(input.idempotencyKey)}`;
    if (tokenLike.startsWith('tok_3ds') && !input.reuse) {
      // a bank challenge — refused outright unless the caller can take the customer through it
      if (!input.allowAction) throw new PaymentDeclinedError('requires_action');
      SimulatorPaymentAdapter.challenges.set(providerRef, {
        token: tokenLike,
        outcome: tokenLike === 'tok_3ds_fail' ? 'fail' : 'complete',
        busyOnce: tokenLike === 'tok_3ds_slow',
        resumes: 0,
      });
      return {
        providerRef,
        brand,
        last4,
        provider: 'simulator',
        actionRequired: { clientSecret: `sim_secret_${hash(input.idempotencyKey)}` },
      };
    }
    const customerRef =
      input.reuse?.customerRef ?? (input.saveForReuse ? `sim_cus_${hash(input.reference)}` : null);
    // `tok_decline_reuse` is stored verbatim (not hashed) as the saved method ref, so a LATER
    // off-session reuse charge (extend / return-settlement) on this same reservation declines —
    // while the original charge that saved it still succeeds. Lets tests exercise "the return
    // itself must succeed even when the settlement charge is declined" without a real card.
    const methodRef =
      input.reuse?.methodRef ??
      (input.saveForReuse
        ? tokenLike === 'tok_decline_reuse'
          ? 'tok_decline_reuse'
          : `sim_pm_${hash(tokenLike)}`
        : null);
    return { providerRef, brand, last4, customerRef, methodRef, provider: 'simulator' };
  }

  async capture(
    providerRef: string,
    _amountMinor: number,
    _idempotencyKey?: string,
  ): Promise<PaymentResult> {
    if (providerRef.includes('capture_fail')) throw new PaymentDeclinedError('capture_failed');
    this.captured.add(providerRef);
    const { brand, last4 } = brandFor(providerRef);
    return { providerRef: providerRef.replace('auth', 'cap'), brand, last4 };
  }

  async resume(providerRef: string, token?: string): Promise<ResumeOutcome> {
    const plan = SimulatorPaymentAdapter.challenges.get(providerRef);
    // unknown to this process (it restarted) or for another card than the one now offered
    if (!plan || (token && token !== plan.token)) {
      SimulatorPaymentAdapter.challenges.delete(providerRef);
      return { kind: 'superseded' };
    }
    plan.resumes += 1;
    if (plan.busyOnce && plan.resumes === 1) {
      return { kind: 'action_required', clientSecret: `sim_secret_${providerRef}` };
    }
    SimulatorPaymentAdapter.challenges.delete(providerRef);
    if (plan.outcome === 'fail') throw new PaymentDeclinedError('authentication_failed');
    const { brand, last4 } = brandFor(plan.token);
    return {
      kind: 'authorized',
      result: {
        providerRef,
        brand,
        last4,
        provider: 'simulator',
        customerRef: null,
        methodRef: null,
      },
    };
  }

  async void(providerRef: string): Promise<void> {
    // no-op in the simulator, bar forgetting a challenge that was waiting on the customer
    SimulatorPaymentAdapter.challenges.delete(providerRef);
  }

  async forgetCustomer(customerRef: string): Promise<void> {
    // a customer ref containing `forget_fail` (a test sets one on an intent row) plays a processor
    // that cannot remove the customer right now
    if (customerRef.includes('forget_fail')) throw new PaymentTimeoutError();
  }

  async refund(
    providerRef: string,
    _amountMinor: number,
    _idempotencyKey?: string,
    _context?: RefundContext,
  ): Promise<PaymentResult> {
    const { brand, last4 } = brandFor(providerRef);
    return { providerRef: providerRef.replace(/auth|cap/, 'ref'), brand, last4 };
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
