/**
 * What we tell Stripe about a payment (DEC-036) — chosen so a payment found in the Stripe
 * dashboard can be traced to our records in one step, and back, without Stripe ever holding a
 * second copy of anything that can change.
 *
 * The rule: **send identifiers, never facts about the booking.** A reference, an id, a purpose
 * are stable forever; a customer's name or email, the pickup date, the plate, the price of the
 * extras, the location's name all change (or belong to someone's personal data) and would go
 * stale in Stripe the moment they change here — leaving the two systems silently disagreeing and
 * turning a debugging aid into a liability. Where a fact is needed, the id gets you to our record
 * of it. Amount and currency are already Stripe's own fields on the payment, so they are not
 * repeated either.
 *
 * Stripe limits: ≤ 50 keys, key ≤ 40 chars, value ≤ 500 chars — we stay far below all three.
 */

export interface PaymentContext {
  /** our human-facing reservation reference — the business key */
  reservationReference: string;
  /** our `payment_intent` row id — the join from a Stripe payment straight to our ledger */
  paymentIntentId: string;
  /** what the payment is for: booking | extension | modification | incidental | adjustment */
  purpose: string;
  /** our account id for a signed-in customer; null for a guest checkout */
  customerId: string | null;
  /** where it was made: web | mobile | staff | guest */
  channel: string | null;
  /** the quote it converted, when it came from one */
  quoteReference?: string | null;
  /** deployment environment (production | development | …) — several deployments can share one
   *  Stripe account, and this is what tells their payments apart */
  environment: string;
}

const SOURCE = 'carrental';

/** `extension-1789960642317` → `extension`. A purpose may carry a uniqueness suffix that means
 *  nothing outside our own idempotency; Stripe only ever sees the kind. */
export function purposeKind(purpose: string): string {
  const kind = purpose.split('-')[0]?.trim().toLowerCase();
  return kind || 'payment';
}

const LABELS: Record<string, string> = {
  booking: 'Booking',
  extension: 'Extension',
  modification: 'Booking change',
  incidental: 'Incidental charge',
  adjustment: 'Adjustment',
};

/** The line Stripe shows in its payments list — short, and only ever a label plus the reference. */
export function paymentDescription(ctx: Pick<PaymentContext, 'purpose' | 'reservationReference'>) {
  const kind = purposeKind(ctx.purpose);
  const label = LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${label} ${ctx.reservationReference}`;
}

/** Drops empty values — Stripe treats an empty string as "unset this key", and a `null`
 *  is rejected, so absent means absent. */
function compact(entries: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

/** Metadata for the PaymentIntent. */
export function paymentMetadata(ctx: PaymentContext): Record<string, string> {
  return compact({
    source: SOURCE,
    env: ctx.environment,
    reservation_reference: ctx.reservationReference,
    payment_id: ctx.paymentIntentId,
    purpose: purposeKind(ctx.purpose),
    // "guest" rather than absent, so a search for guest checkouts is possible in Stripe
    customer_id: ctx.customerId ?? 'guest',
    channel: ctx.channel,
    quote_reference: ctx.quoteReference,
  });
}

/** Metadata for the Stripe Customer created to save a card for later off-session charges. Ids
 *  only: no name, no email, no phone — Stripe does not need them to charge a saved card. */
export function customerMetadata(ctx: PaymentContext): Record<string, string> {
  return compact({
    source: SOURCE,
    env: ctx.environment,
    customer_id: ctx.customerId ?? 'guest',
    reservation_reference: ctx.reservationReference,
  });
}

/** Metadata for a refund, which Stripe keeps separately from the payment it refunds. */
export function refundMetadata(
  ctx: Pick<PaymentContext, 'reservationReference' | 'paymentIntentId' | 'purpose' | 'environment'>,
): Record<string, string> {
  return compact({
    source: SOURCE,
    env: ctx.environment,
    reservation_reference: ctx.reservationReference,
    payment_id: ctx.paymentIntentId,
    purpose: purposeKind(ctx.purpose),
  });
}
