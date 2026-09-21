import { fromStripeAmount, stripeCurrency } from '@carrental/i18n';
import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import Stripe from 'stripe';

import { AppError } from '../../common/app-error';
import { Public } from '../../common/auth/auth.guard';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { paymentIntent } from '../../database/schema/payment';

import { PaymentConfigService } from './payment-config.service';
import { PaymentService } from './payment.service';

const RECONCILE_EVENTS = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.refunded',
]);

/** A chargeback's life at the card network (FR-PAY-008, DEC-039). Subscribe the webhook endpoint to
 *  these in the Stripe dashboard — an event Stripe is never asked to send cannot be handled. */
const DISPUTE_EVENTS = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'charge.dispute.closed',
]);

/**
 * The async half of a real Stripe integration (DEC-006's named scenarios: duplicate/out-of-order
 * webhook, signature failure, outage/recovery). This app's own authorize→capture flow is
 * synchronous and doesn't *depend* on webhooks to function — this endpoint exists to catch the
 * cases where Stripe's own record of what happened ends up disagreeing with ours (a request
 * timed out on our side but actually completed on Stripe's, a refund was issued directly from
 * the Stripe dashboard, etc.). On a mismatch this NEVER silently "fixes" the local ledger — it
 * opens the same `reconciliation_exception` a human already reviews for every other kind of
 * drift (FR-INT-002), matching this app's one existing rule for money: a human looks at anything
 * that doesn't add up, nothing auto-corrects itself quietly.
 */
@ApiExcludeController()
@Controller({ path: 'webhooks/stripe', version: '1' })
export class StripeWebhookController {
  private readonly logger = new Logger('StripeWebhookController');

  constructor(
    private readonly config: PaymentConfigService,
    private readonly payments: PaymentService,
    private readonly idempotency: IdempotencyService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig?: string) {
    if (!req.rawBody || !sig) {
      throw AppError.validation([{ path: 'body', code: 'invalid_string' }], 'Missing signature');
    }
    const webhookSecret = await this.config.activeWebhookSecret();
    if (!webhookSecret) {
      // no webhook secret configured for whichever mode is currently active — nothing to verify
      // against; ack anyway so Stripe doesn't retry forever for a merchant who hasn't set one up.
      this.logger.warn('stripe webhook received but no webhook secret is configured — ignored');
      return { received: true, handled: false };
    }

    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      this.logger.warn({ err }, 'stripe webhook signature verification failed');
      throw AppError.validation(
        [{ path: 'stripe-signature', code: 'invalid_string' }],
        'Invalid webhook signature',
      );
    }

    const idem = await this.idempotency.begin({
      actorKey: 'stripe-webhook',
      operation: 'stripe.event',
      key: event.id,
      body: { type: event.type },
      // Stripe re-sends an event we answered 5xx to. Without this, that retry found our own stored
      // failure, was answered "replay" (200) and the event was lost for good (DEC-039).
      retryFailed: true,
    });
    if (idem.status === 'replay') return { received: true, handled: false, replay: true };

    try {
      if (RECONCILE_EVENTS.has(event.type)) await this.reconcile(event);
      else if (DISPUTE_EVENTS.has(event.type)) await this.recordDispute(event);
      await idem.finalize(200, { handled: true });
      return { received: true, handled: true };
    } catch (err) {
      await idem.finalize(500, { handled: false, error: String(err) });
      throw err;
    }
  }

  /** `charge.dispute.*` — the object is a Dispute, not a PaymentIntent, so it is matched to our
   *  ledger through the `payment_intent` it names. */
  private async recordDispute(event: Stripe.Event): Promise<void> {
    const obj = event.data.object as {
      id: string;
      charge?: string | null;
      payment_intent?: string | null;
      amount?: number;
      currency?: string;
      reason?: string;
      status?: string;
      evidence_details?: { due_by?: number | null } | null;
    };
    if (!obj.payment_intent) {
      // a charge that was never part of a PaymentIntent — nothing of ours to attach it to
      this.logger.warn(
        { disputeId: obj.id, eventType: event.type },
        'stripe dispute names no payment intent — ignored',
      );
      return;
    }
    const [local] = await this.db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.providerRef, obj.payment_intent))
      .limit(1);
    if (!local) return; // an intent we have no record of — same rule as `reconcile`

    const { created } = await this.payments.recordDispute({
      organizationId: local.organizationId,
      reservationReference: local.reservationReference,
      intentId: local.id,
      disputeId: obj.id,
      chargeId: obj.charge ?? null,
      amountMinor: fromStripeAmount(obj.amount ?? 0, local.currency),
      reason: obj.reason ?? null,
      status: obj.status ?? null,
      dueBy: obj.evidence_details?.due_by
        ? new Date(obj.evidence_details.due_by * 1000).toISOString()
        : null,
      eventType: event.type,
    });
    this.logger.warn(
      { disputeId: obj.id, eventType: event.type, status: obj.status, created },
      created
        ? 'stripe dispute opened — reconciliation exception raised for finance'
        : 'stripe dispute updated — its reconciliation exception refreshed',
    );
  }

  private async reconcile(event: Stripe.Event): Promise<void> {
    const obj = event.data.object as {
      id: string;
      payment_intent?: string;
      amount_received?: number;
      amount_refunded?: number;
      /** lower-case ISO code, on both PaymentIntent and Charge events */
      currency?: string;
    };
    const providerRef = event.type.startsWith('charge.') ? obj.payment_intent : obj.id;
    if (!providerRef) return;

    const [local] = await this.db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.providerRef, providerRef))
      .limit(1);
    if (!local) return; // an intent we have no record of at all is out of scope here — nothing local to reconcile against

    // `requires_action` is a legitimate place for a failed / cancelled payment to still be: a
    // customer who fails or abandons their bank challenge (DEC-040), or a provider timeout, leaves
    // the ledger there until the retry resolves it — that is not a disagreement worth a human's time.
    const expected: Record<string, string[]> = {
      'payment_intent.succeeded': ['captured'],
      'payment_intent.payment_failed': ['failed', 'voided', 'requires_action'],
      'payment_intent.canceled': ['voided', 'requires_action'],
      'charge.refunded': ['refunded', 'partially_refunded'],
    };
    const okStates = expected[event.type];
    if (!okStates || !okStates.includes(local.state)) {
      await this.payments.openReconciliationException({
        organizationId: local.organizationId,
        reservationReference: local.reservationReference,
        intentId: local.id,
        kind: 'missing_in_ledger',
      });
      this.logger.warn(
        { providerRef, eventType: event.type, localState: local.state },
        'stripe webhook disagrees with local payment ledger — reconciliation exception opened',
      );
      return;
    }

    // A payment in a different currency than our ledger recorded can never be reconciled by
    // comparing numbers — 5000 is not 5000 — so it is its own kind of exception, raised before any
    // amount is compared.
    if (obj.currency && obj.currency !== stripeCurrency(local.currency)) {
      await this.payments.openReconciliationException({
        organizationId: local.organizationId,
        reservationReference: local.reservationReference,
        intentId: local.id,
        kind: 'currency_mismatch',
      });
      this.logger.warn(
        {
          providerRef,
          eventType: event.type,
          ledgerCurrency: local.currency,
          currency: obj.currency,
        },
        'stripe webhook currency disagrees with local payment ledger — reconciliation exception opened',
      );
      return;
    }

    // The state alone can agree by coincidence — e.g. the ledger is already
    // `partially_refunded` from an earlier, smaller refund when this webhook reports a second,
    // different-amount one. Cross-check the actual amount Stripe reports against the ledger so
    // a same-state-wrong-amount drift is never mistaken for "nothing to do".
    const stripeAmount =
      event.type === 'charge.refunded'
        ? obj.amount_refunded
        : event.type === 'payment_intent.succeeded'
          ? obj.amount_received
          : undefined;
    // Stripe reports its own smallest unit; the ledger is in our minor unit — same number for
    // every supported currency today, but the conversion is the one place that would say so
    const providerAmount =
      stripeAmount == null ? undefined : fromStripeAmount(stripeAmount, local.currency);
    const ledgerAmount = event.type === 'charge.refunded' ? local.refundedMinor : local.amountMinor;
    if (providerAmount != null && providerAmount !== ledgerAmount) {
      await this.payments.openReconciliationException({
        organizationId: local.organizationId,
        reservationReference: local.reservationReference,
        intentId: local.id,
        kind: 'amount_mismatch',
        ledgerAmountMinor: ledgerAmount,
        providerAmountMinor: providerAmount,
      });
      this.logger.warn(
        { providerRef, eventType: event.type, ledgerAmount, providerAmount },
        'stripe webhook amount disagrees with local payment ledger — reconciliation exception opened',
      );
    }
  }
}
