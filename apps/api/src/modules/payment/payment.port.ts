/**
 * PaymentPort — the boundary to a card processor (SRS-ARC-001 ports pattern, FR-PAY-001..003).
 * The only implementation here is a deterministic simulator: card data never enters the system,
 * only an opaque token whose value selects the outcome so error paths are testable.
 *
 *   tok_ok / tok_visa_...     → authorize + capture succeed
 *   tok_decline               → authorize declines (card_declined)
 *   tok_timeout               → authorize throws a timeout (no definite result)
 *   tok_capture_fail          → authorize ok, capture fails
 *   anything else             → succeeds (treated as a normal token)
 */

export interface AuthorizeInput {
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  token: string;
  reference: string;
}

export interface PaymentResult {
  providerRef: string;
  brand: string;
  last4: string;
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
    if (input.token === 'tok_timeout') throw new PaymentTimeoutError();
    if (input.token === 'tok_decline') throw new PaymentDeclinedError('card_declined');
    if (input.amountMinor <= 0) throw new PaymentDeclinedError('invalid_amount');
    const { brand, last4 } = brandFor(input.token);
    // stable providerRef per idempotency key so a retry of the same key maps to the same auth
    const providerRef = `sim_auth_${hash(input.idempotencyKey)}`;
    return { providerRef, brand, last4 };
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
