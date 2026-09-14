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
 *   anything else             → succeeds (treated as a normal token)
 */

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
}

export interface PaymentResult {
  providerRef: string;
  brand: string;
  last4: string;
  /** present when `saveForReuse` was honored (or `reuse` was used, echoing it back) — null when
   *  the active provider doesn't support saved methods (e.g. an old simulator charge). */
  customerRef?: string | null;
  methodRef?: string | null;
}

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
  abstract capture(providerRef: string, amountMinor: number): Promise<PaymentResult>;
  abstract void(providerRef: string): Promise<void>;
  abstract refund(providerRef: string, amountMinor: number): Promise<PaymentResult>;
}

function brandFor(token: string): { brand: string; last4: string } {
  if (token.includes('amex')) return { brand: 'amex', last4: '0005' };
  if (token.includes('mastercard') || token.includes('mc'))
    return { brand: 'mastercard', last4: '4444' };
  return { brand: 'visa', last4: '4242' };
}

export class SimulatorPaymentAdapter extends PaymentPort {
  private captured = new Set<string>();

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
    return { providerRef, brand, last4, customerRef, methodRef };
  }

  async capture(providerRef: string, _amountMinor: number): Promise<PaymentResult> {
    if (providerRef.includes('capture_fail')) throw new PaymentDeclinedError('capture_failed');
    this.captured.add(providerRef);
    const { brand, last4 } = brandFor(providerRef);
    return { providerRef: providerRef.replace('auth', 'cap'), brand, last4 };
  }

  async void(_providerRef: string): Promise<void> {
    // no-op in the simulator
  }

  async refund(providerRef: string, _amountMinor: number): Promise<PaymentResult> {
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
