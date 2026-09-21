import { isSupportedCurrency } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { payment, paymentIntent, recoveryCase } from '../../database/schema/payment';
import { reconciliationException, reservation } from '../../database/schema/reservation';

import {
  PaymentDeclinedError,
  PaymentPort,
  PaymentProviderConfigError,
  PaymentTimeoutError,
} from './payment.port';
import type { PaymentContext } from './stripe-metadata';

export interface AuthorizeAndCaptureInput {
  organizationId: string;
  reservationReference: string;
  purpose?: string;
  amountMinor: number;
  currency: string;
  /** omit to charge the reservation's saved payment method off-session (extend-hire / an
   *  incidental charge on a reservation that already has a captured booking payment) — see
   *  `findSavedMethod`. Required on a reservation's first charge. */
  token?: string;
  actor: Actor | null;
  /** who and where, for the processor's records (stripe-metadata.ts). All optional: whatever a
   *  caller leaves out is read from the reservation itself, so an extend / incidental charge
   *  needs no extra plumbing. `customerId` null means "guest"; `undefined` means "look it up". */
  customerId?: string | null;
  channel?: string | null;
  quoteReference?: string | null;
  /** the caller can send the customer through a bank (3-D Secure) challenge and be called again —
   *  only the checkout's confirm can. Then a challenge is the `payment_action_required` error
   *  (nothing charged or held) and the retry picks the authenticated payment up; without it a
   *  challenge is a decline, exactly as before (DEC-040). */
  allowAction?: boolean;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly port: PaymentPort,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The ids a processor should carry with a charge. What the caller didn't say is read from the
   * reservation (an extension, a settlement); a brand-new booking has no reservation row yet, so
   * its caller states the customer and channel directly.
   */
  private async contextFor(
    input: AuthorizeAndCaptureInput,
    intentId: string,
    purpose: string,
  ): Promise<PaymentContext> {
    let customerId = input.customerId;
    let channel = input.channel;
    if (customerId === undefined || channel === undefined) {
      const [res] = await this.db
        .select({ accountId: reservation.accountId, channel: reservation.channel })
        .from(reservation)
        .where(eq(reservation.reference, input.reservationReference))
        .limit(1);
      if (customerId === undefined) customerId = res?.accountId ?? null;
      if (channel === undefined) channel = res?.channel ?? null;
    }
    return {
      reservationReference: input.reservationReference,
      paymentIntentId: intentId,
      purpose,
      customerId,
      channel: channel ?? null,
      quoteReference: input.quoteReference ?? null,
      environment: this.env.NODE_ENV,
    };
  }

  /**
   * Idempotent authorize + capture for a reservation. A duplicate call (same reservation +
   * purpose) returns the existing captured intent instead of charging again (FR-PAY-002).
   * A provider timeout leaves the intent `requires_action` and throws `provider_timeout` — the
   * caller must not create a reservation. A decline throws `business_rule_violation`. With
   * `allowAction`, a bank challenge leaves the intent `requires_action` (no failure code, a
   * provider ref) and throws `payment_action_required`; calling again once the customer has
   * authenticated captures it — or, if they since offered another card or a different amount,
   * drops the old attempt and starts afresh.
   */
  async authorizeAndCapture(input: AuthorizeAndCaptureInput): Promise<{
    intentId: string;
    state: string;
    providerRef: string | null;
    brand: string | null;
    last4: string | null;
    alreadyProcessed: boolean;
  }> {
    const purpose = input.purpose ?? 'booking';
    // Only a currency the processor can take at our minor unit may be charged (the catalogue in
    // @carrental/i18n). Checked before anything is recorded, so an unsupported currency is a
    // clear refusal rather than a half-written intent and a provider error mid-checkout.
    if (!isSupportedCurrency(input.currency)) {
      throw AppError.businessRule(`Payments in ${input.currency} are not supported`, {
        reason: 'currency_not_supported',
        currency: input.currency,
      });
    }
    const [existing] = await this.db
      .select()
      .from(paymentIntent)
      .where(
        and(
          eq(paymentIntent.reservationReference, input.reservationReference),
          eq(paymentIntent.purpose, purpose),
        ),
      )
      .limit(1);

    if (existing && ['authorized', 'captured'].includes(existing.state)) {
      return {
        intentId: existing.id,
        state: existing.state,
        providerRef: existing.providerRef,
        brand: existing.methodBrand,
        last4: existing.methodLast4,
        alreadyProcessed: true,
      };
    }

    let intentId = existing?.id;
    if (!intentId) {
      const inserted = await this.db
        .insert(paymentIntent)
        .values({
          organizationId: input.organizationId,
          reservationReference: input.reservationReference,
          purpose,
          amountMinor: input.amountMinor,
          currency: input.currency,
          state: 'requires_action',
          createdBy: input.actor?.accountId ?? null,
        })
        .onConflictDoNothing({
          target: [paymentIntent.reservationReference, paymentIntent.purpose],
        })
        .returning({ id: paymentIntent.id });
      if (inserted[0]) {
        intentId = inserted[0].id;
      } else {
        // a concurrent call created it first — adopt it, and if it is already settled, return it
        const [row] = await this.db
          .select()
          .from(paymentIntent)
          .where(
            and(
              eq(paymentIntent.reservationReference, input.reservationReference),
              eq(paymentIntent.purpose, purpose),
            ),
          )
          .limit(1);
        if (row && ['authorized', 'captured'].includes(row.state)) {
          return {
            intentId: row.id,
            state: row.state,
            providerRef: row.providerRef,
            brand: row.methodBrand,
            last4: row.methodLast4,
            alreadyProcessed: true,
          };
        }
        intentId = row!.id;
      }
    }

    // ---- authorize ----
    // a caller-omitted token means "charge the reservation's saved method off-session" (extend /
    // incidental charges) — look up whichever earlier intent on this reservation saved one.
    const saved = input.token ? null : await this.findSavedMethod(input.reservationReference);
    if (!input.token && !saved) {
      throw new AppError('business_rule_violation', {
        title: 'No saved payment method on file for this reservation and no card was provided',
        params: { reason: 'no_payment_method' },
      });
    }

    // A bank challenge may already be waiting on this reservation's payment: pick it up rather than
    // charge again. Only a caller that can run one (`allowAction`) ever starts one, so only its
    // retries arrive here. A timeout also leaves `requires_action`, but with a failure code.
    let pendingRef =
      input.allowAction &&
      existing?.state === 'requires_action' &&
      existing.providerRef &&
      !existing.failureCode
        ? existing.providerRef
        : null;
    // the attempt we drop, if any — a restart needs its own idempotency key at the processor
    let supersededRef: string | null = null;
    if (
      pendingRef &&
      existing &&
      (existing.amountMinor !== input.amountMinor || existing.currency !== input.currency)
    ) {
      // what is being paid changed since the challenge began: the authenticated payment is for
      // the wrong amount, so it can never be captured for this one
      await this.port.void(pendingRef).catch(() => undefined);
      await this.db
        .update(paymentIntent)
        .set({
          amountMinor: input.amountMinor,
          currency: input.currency,
          providerRef: null,
          updatedAt: sql`now()`,
        })
        .where(eq(paymentIntent.id, intentId));
      supersededRef = pendingRef;
      pendingRef = null;
    }

    let auth: {
      providerRef: string;
      brand: string;
      last4: string;
      customerRef?: string | null;
      methodRef?: string | null;
      provider?: string;
    };
    try {
      const resumed = pendingRef ? await this.port.resume(pendingRef, input.token) : null;
      if (resumed?.kind === 'action_required') throw this.actionRequired(resumed.clientSecret);
      if (resumed?.kind === 'authorized') {
        auth = resumed.result;
      } else {
        // no challenge pending — or the pending one was for another card / is gone
        if (resumed?.kind === 'superseded') supersededRef = pendingRef;
        const fresh = await this.port.authorize({
          // Keyed on the specific payment method, not just reservation+purpose: a genuine retry of
          // the *same* card (double-click, network hiccup) reuses the same Stripe idempotency key
          // and is safely deduped, but a customer retrying with a *different* card after a decline
          // must get a fresh key — Stripe itself rejects a reused key whose request body differs
          // (StripeIdempotencyError), which is exactly what a fixed `reservationReference:purpose`
          // key caused on every retry-with-a-different-card. Restarting after a dropped challenge
          // gets its own key too: the same card + amount would otherwise replay the cancelled one.
          idempotencyKey:
            `${input.reservationReference}:${purpose}:${input.token ?? saved?.methodRef ?? 'off-session'}` +
            (supersededRef ? `:restart:${supersededRef}:${input.amountMinor}` : ''),
          amountMinor: input.amountMinor,
          currency: input.currency,
          token: input.token,
          reference: input.reservationReference,
          reuse: saved ?? undefined,
          saveForReuse: !saved,
          context: await this.contextFor(input, intentId, purpose),
          allowAction: input.allowAction,
        });
        if (fresh.actionRequired) {
          // the bank wants the customer to authenticate — nothing is held or charged yet. Keep the
          // provider ref so the retry can resume it; the reservation is NOT created.
          await this.recordLedger(
            intentId,
            input.reservationReference,
            'authorize',
            input,
            'pending',
            undefined,
            fresh.providerRef,
          );
          await this.db
            .update(paymentIntent)
            .set({
              ...(fresh.provider ? { provider: fresh.provider } : {}),
              providerRef: fresh.providerRef,
              failureCode: null,
              updatedAt: sql`now()`,
            })
            .where(eq(paymentIntent.id, intentId));
          throw this.actionRequired(fresh.actionRequired.clientSecret);
        }
        auth = fresh;
      }
    } catch (err) {
      if (err instanceof PaymentTimeoutError) {
        await this.recordLedger(
          intentId,
          input.reservationReference,
          'authorize',
          input,
          'pending',
        );
        await this.db
          .update(paymentIntent)
          .set({ state: 'requires_action', failureCode: 'provider_timeout', updatedAt: sql`now()` })
          .where(eq(paymentIntent.id, intentId));
        throw new AppError('provider_timeout', {
          title: 'The payment provider did not respond — no charge was made',
          params: { reason: 'provider_timeout' },
        });
      }
      if (err instanceof PaymentDeclinedError) {
        await this.recordLedger(
          intentId,
          input.reservationReference,
          'authorize',
          input,
          'failed',
          err.failureCode,
        );
        await this.db
          .update(paymentIntent)
          .set({ state: 'failed', failureCode: err.failureCode, updatedAt: sql`now()` })
          .where(eq(paymentIntent.id, intentId));
        throw AppError.businessRule('The payment was declined', { reason: err.failureCode });
      }
      if (err instanceof PaymentProviderConfigError) {
        // this is OUR misconfiguration, never the guest's card — recorded the same way any other
        // "a consequential step failed for reasons the customer can't fix" case is (FR-INT-002),
        // and surfaced as its own distinct error so the UI never tells a guest their card failed.
        await this.openCase({
          organizationId: input.organizationId,
          kind: 'payment_orphan',
          subjectType: 'payment_intent',
          subjectRef: intentId,
          summary: 'Stripe rejected the configured API key',
          detail: { message: err.message },
        });
        throw new AppError('business_rule_violation', {
          title: 'Payments are temporarily unavailable — this has been flagged for the team',
          params: { reason: 'payment_provider_misconfigured' },
        });
      }
      throw err;
    }

    await this.db
      .update(paymentIntent)
      .set({
        state: 'authorized',
        ...(auth.provider ? { provider: auth.provider } : {}),
        providerRef: auth.providerRef,
        methodBrand: auth.brand,
        methodLast4: auth.last4,
        providerCustomerRef: auth.customerRef ?? saved?.customerRef ?? null,
        providerMethodRef: auth.methodRef ?? saved?.methodRef ?? null,
        authorizedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(paymentIntent.id, intentId));
    await this.recordLedger(
      intentId,
      input.reservationReference,
      'authorize',
      input,
      'succeeded',
      undefined,
      auth.providerRef,
    );

    // ---- capture ----
    try {
      // Stable per intent, not per call — a concurrent duplicate capture (two requests that both
      // passed the dedupe above because neither had captured yet) is deduplicated by the provider
      // itself instead of the second call failing "already captured" against an intent the first
      // one just settled.
      const cap = await this.port.capture(
        auth.providerRef,
        input.amountMinor,
        `capture:${intentId}`,
      );
      await this.db
        .update(paymentIntent)
        .set({
          state: 'captured',
          providerRef: cap.providerRef,
          capturedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(paymentIntent.id, intentId));
      await this.recordLedger(
        intentId,
        input.reservationReference,
        'capture',
        input,
        'succeeded',
        undefined,
        cap.providerRef,
      );
      await this.outbox.emit({
        type: 'payment.captured.v1',
        aggregateType: 'payment_intent',
        aggregateId: intentId,
        payload: {
          reservationReference: input.reservationReference,
          amountMinor: input.amountMinor,
        },
      });
      return {
        intentId,
        state: 'captured',
        providerRef: cap.providerRef,
        brand: cap.brand,
        last4: cap.last4,
        alreadyProcessed: false,
      };
    } catch (err) {
      // authorized but capture failed — void the auth so no money is held, surface a failure
      await this.port.void(auth.providerRef).catch(() => undefined);
      await this.db
        .update(paymentIntent)
        .set({ state: 'voided', failureCode: 'capture_failed', updatedAt: sql`now()` })
        .where(eq(paymentIntent.id, intentId));
      await this.recordLedger(intentId, input.reservationReference, 'void', input, 'succeeded');
      throw new AppError('business_rule_violation', {
        title: 'The card was authorized but the charge could not be completed',
        params: { reason: 'capture_failed' },
        cause: err,
      });
    }
  }

  /** Refund up to the captured amount (FR-PAY-006 partial; full flow in STAGE-004). */
  async refund(
    actor: Actor,
    reservationReference: string,
    amountMinor: number,
    purpose = 'booking',
  ): Promise<{ refundedMinor: number; state: string }> {
    const [intent] = await this.db
      .select()
      .from(paymentIntent)
      .where(
        and(
          eq(paymentIntent.reservationReference, reservationReference),
          eq(paymentIntent.purpose, purpose),
        ),
      )
      .limit(1);
    if (!intent || intent.state !== 'captured') {
      throw new AppError('business_rule_violation', {
        title: 'Nothing captured to refund',
        params: { reason: 'not_captured' },
      });
    }
    const remaining = intent.amountMinor - intent.refundedMinor;
    if (amountMinor <= 0 || amountMinor > remaining) {
      throw new AppError('business_rule_violation', {
        title: 'Refund amount exceeds the remaining captured amount',
        params: { reason: 'over_refund', remainingMinor: remaining },
      });
    }

    // Atomically claim the refund before calling the provider. A plain read-then-write here (the
    // shape this codebase's other money-moving races were fixed by removing) would let two
    // concurrent callers — an ordinary double-click, or a client retry after a slow response —
    // both pass the checks above and both issue a real, separate refund. Only one caller can flip
    // `state` away from `captured`, since a refund always requires `state === 'captured'` up
    // front; the loser gets a clean conflict instead of a second charge to Stripe.
    const refundedMinor = intent.refundedMinor + amountMinor;
    const state = refundedMinor >= intent.amountMinor ? 'refunded' : 'partially_refunded';
    const claimed = await this.db
      .update(paymentIntent)
      .set({ refundedMinor, state, updatedAt: sql`now()` })
      .where(and(eq(paymentIntent.id, intent.id), eq(paymentIntent.state, 'captured')))
      .returning({ id: paymentIntent.id });
    if (!claimed[0]) {
      throw new AppError('business_rule_violation', {
        title: 'A refund for this payment is already in progress or has already completed',
        params: { reason: 'refund_in_progress' },
      });
    }

    try {
      // Stable per intent — since only one refund is ever allowed per intent's lifetime (the
      // `state === 'captured'` gate above), this key is also stable across a retry of this same
      // logical refund, so the provider itself never issues it twice even if the block below
      // rolls the local claim back and something retries.
      const res = await this.port.refund(intent.providerRef!, amountMinor, `refund:${intent.id}`, {
        reservationReference,
        paymentIntentId: intent.id,
        purpose: intent.purpose,
      });
      await this.recordLedger(
        intent.id,
        reservationReference,
        'refund',
        { amountMinor, currency: intent.currency, actor },
        'succeeded',
        undefined,
        res.providerRef,
      );
      await this.audit.record({
        action: 'payment.refunded',
        targetType: 'payment_intent',
        targetId: intent.id,
        actor,
        after: { refundedMinor, state },
      });
      return { refundedMinor, state };
    } catch (err) {
      // the claim above already committed the intent to refunded/partially_refunded — if the
      // actual provider call then fails, roll the bookkeeping back to `captured` so this isn't
      // permanently stuck refusing every future refund attempt with `refund_in_progress`.
      await this.db
        .update(paymentIntent)
        .set({ refundedMinor: intent.refundedMinor, state: intent.state, updatedAt: sql`now()` })
        .where(eq(paymentIntent.id, intent.id));
      await this.recordLedger(
        intent.id,
        reservationReference,
        'refund',
        { amountMinor, currency: intent.currency, actor },
        'failed',
      );
      throw err;
    }
  }

  async openCase(input: {
    organizationId: string;
    kind: string;
    subjectType: string;
    subjectRef: string;
    summary: string;
    detail?: Record<string, unknown>;
  }): Promise<string> {
    const [row] = await this.db
      .insert(recoveryCase)
      .values({
        organizationId: input.organizationId,
        kind: input.kind,
        subjectType: input.subjectType,
        subjectRef: input.subjectRef,
        summary: input.summary,
        detail: input.detail ?? {},
      })
      .returning({ id: recoveryCase.id });
    await this.outbox.emit({
      type: 'case.opened.v1',
      aggregateType: 'recovery_case',
      aggregateId: row!.id,
      payload: { kind: input.kind, subjectRef: input.subjectRef },
    });
    return row!.id;
  }

  /** Any earlier successfully-authorized intent on this reservation that saved a reusable
   *  customer + payment method (whichever purpose it was — usually the original booking
   *  charge), oldest first, so an extend/incidental charge always reuses the *first* card a
   *  guest paid with rather than whichever charge happened most recently. */
  private async findSavedMethod(
    reservationReference: string,
  ): Promise<{ customerRef: string; methodRef: string } | null> {
    const [row] = await this.db
      .select({
        customerRef: paymentIntent.providerCustomerRef,
        methodRef: paymentIntent.providerMethodRef,
      })
      .from(paymentIntent)
      .where(
        and(
          eq(paymentIntent.reservationReference, reservationReference),
          sql`${paymentIntent.providerCustomerRef} is not null`,
          sql`${paymentIntent.providerMethodRef} is not null`,
        ),
      )
      .orderBy(paymentIntent.createdAt)
      .limit(1);
    if (!row?.customerRef || !row.methodRef) return null;
    return { customerRef: row.customerRef, methodRef: row.methodRef };
  }

  async intentFor(reservationReference: string, purpose = 'booking') {
    const [row] = await this.db
      .select()
      .from(paymentIntent)
      .where(
        and(
          eq(paymentIntent.reservationReference, reservationReference),
          eq(paymentIntent.purpose, purpose),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async ledgerFor(reservationReference: string) {
    return this.db
      .select()
      .from(payment)
      .where(eq(payment.reservationReference, reservationReference))
      .orderBy(desc(payment.createdAt));
  }

  private async recordLedger(
    intentId: string,
    reservationReference: string,
    type: string,
    input: { amountMinor: number; currency: string; actor: Actor | null },
    outcome: string,
    failureCode?: string,
    providerRef?: string,
  ): Promise<void> {
    await this.db.insert(payment).values({
      intentId,
      reservationReference,
      type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      outcome,
      failureCode: failureCode ?? null,
      providerRef: providerRef ?? null,
      createdBy: input.actor?.accountId ?? null,
    });
  }

  // -------------------------------------------------- recovery cases / reconciliation

  async listOpenCases() {
    return this.db
      .select()
      .from(recoveryCase)
      .where(sql`${recoveryCase.state} <> 'resolved'`)
      .orderBy(desc(recoveryCase.createdAt))
      .limit(200);
  }

  async getCase(id: string) {
    const [row] = await this.db.select().from(recoveryCase).where(eq(recoveryCase.id, id)).limit(1);
    return row ?? null;
  }

  /** Merge a partial `detail` patch onto a case without touching its `state` (used by retry). */
  async patchCaseDetail(id: string, patch: Record<string, unknown>): Promise<void> {
    const current = await this.getCase(id);
    if (!current) return;
    await this.db
      .update(recoveryCase)
      .set({
        detail: { ...(current.detail ?? {}), ...patch },
        updatedAt: sql`now()`,
      })
      .where(eq(recoveryCase.id, id));
  }

  async resolveCase(actor: Actor, id: string, note: string): Promise<void> {
    await this.db
      .update(recoveryCase)
      .set({
        state: 'resolved',
        resolvedAt: sql`now()`,
        resolutionNote: note,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(recoveryCase.id, id));
  }

  /** Every captured intent — the input to a reconciliation run. */
  async allCapturedIntents() {
    return this.db
      .select()
      .from(paymentIntent)
      .where(sql`${paymentIntent.state} in ('captured','partially_refunded','refunded')`);
  }

  async openReconciliationException(input: {
    organizationId: string;
    reservationReference?: string | null;
    intentId?: string | null;
    kind: string;
    ledgerAmountMinor?: number | null;
    providerAmountMinor?: number | null;
    /** what a person needs to act on it (a dispute's reason and evidence deadline, …) */
    detail?: Record<string, unknown> | null;
  }): Promise<string> {
    const [row] = await this.db
      .insert(reconciliationException)
      .values({
        organizationId: input.organizationId,
        reservationReference: input.reservationReference ?? null,
        intentId: input.intentId ?? null,
        kind: input.kind,
        ledgerAmountMinor: input.ledgerAmountMinor ?? null,
        providerAmountMinor: input.providerAmountMinor ?? null,
        detail: input.detail ?? null,
      })
      .returning({ id: reconciliationException.id });
    await this.outbox.emit({
      type: 'payment.reconciliation.exception.v1',
      aggregateType: 'reconciliation_exception',
      aggregateId: row!.id,
      payload: { kind: input.kind, reservationReference: input.reservationReference },
    });
    return row!.id;
  }

  /** The customer's bank wants them to authenticate (3-D Secure). `clientSecret` is the customer's
   *  own single-use handle for completing it in the browser / app; it is redacted from logs. */
  private actionRequired(clientSecret: string): AppError {
    return new AppError('payment_action_required', {
      title: 'Your bank needs to confirm this payment',
      params: { reason: 'authentication_required', clientSecret },
    });
  }

  /**
   * A chargeback / dispute raised at the card network (FR-PAY-008). Like every other disagreement
   * with the provider this NEVER edits the ledger — money is moved by a person, not by a webhook —
   * it puts the dispute in front of finance: ONE open `dispute` exception per dispute, carrying the
   * reason and the evidence deadline (after which the provider decides against us by default).
   * Later events for the same dispute (updated / funds withdrawn / closed) refresh that same
   * exception instead of piling up new ones; once finance has resolved it, a further event is new
   * information (e.g. a closed-as-lost) and opens a fresh one.
   */
  async recordDispute(input: {
    organizationId: string;
    reservationReference: string | null;
    intentId: string;
    disputeId: string;
    chargeId: string | null;
    amountMinor: number;
    reason: string | null;
    status: string | null;
    /** the last day evidence can be submitted, ISO-8601 */
    dueBy: string | null;
    eventType: string;
  }): Promise<{ id: string; created: boolean }> {
    const detail = {
      disputeId: input.disputeId,
      chargeId: input.chargeId,
      reason: input.reason,
      status: input.status,
      dueBy: input.dueBy,
      lastEvent: input.eventType,
    };
    const [open] = await this.db
      .select({ id: reconciliationException.id })
      .from(reconciliationException)
      .where(
        and(
          eq(reconciliationException.kind, 'dispute'),
          eq(reconciliationException.state, 'open'),
          eq(reconciliationException.intentId, input.intentId),
          sql`${reconciliationException.detail}->>'disputeId' = ${input.disputeId}`,
        ),
      )
      .limit(1);
    if (open) {
      await this.db
        .update(reconciliationException)
        .set({ providerAmountMinor: input.amountMinor, detail, updatedAt: sql`now()` })
        .where(eq(reconciliationException.id, open.id));
      return { id: open.id, created: false };
    }
    const id = await this.openReconciliationException({
      organizationId: input.organizationId,
      reservationReference: input.reservationReference,
      intentId: input.intentId,
      kind: 'dispute',
      providerAmountMinor: input.amountMinor,
      detail,
    });
    return { id, created: true };
  }

  async listReconciliationExceptions() {
    const rows = await this.db
      .select({
        e: reconciliationException,
        currency: paymentIntent.currency,
      })
      .from(reconciliationException)
      .leftJoin(paymentIntent, eq(paymentIntent.id, reconciliationException.intentId))
      .where(eq(reconciliationException.state, 'open'))
      .orderBy(desc(reconciliationException.createdAt))
      .limit(200);
    return rows.map(({ e, currency }) => ({
      ...e,
      currency: currency ?? 'USD',
      deltaMinor:
        e.ledgerAmountMinor != null && e.providerAmountMinor != null
          ? e.ledgerAmountMinor - e.providerAmountMinor
          : null,
    }));
  }

  async resolveReconciliationException(actor: Actor, id: string, note: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(reconciliationException)
      .where(eq(reconciliationException.id, id))
      .limit(1);
    if (!row) throw AppError.notFound('exception');
    await this.db
      .update(reconciliationException)
      .set({
        state: 'resolved',
        resolvedAt: sql`now()`,
        resolutionNote: note,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(reconciliationException.id, id));
  }
}
