import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { payment, paymentIntent, recoveryCase } from '../../database/schema/payment';
import { reconciliationException } from '../../database/schema/reservation';

import { PaymentDeclinedError, PaymentPort, PaymentTimeoutError } from './payment.port';

export interface AuthorizeAndCaptureInput {
  organizationId: string;
  reservationReference: string;
  purpose?: string;
  amountMinor: number;
  currency: string;
  token: string;
  actor: Actor | null;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly port: PaymentPort,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Idempotent authorize + capture for a reservation. A duplicate call (same reservation +
   * purpose) returns the existing captured intent instead of charging again (FR-PAY-002).
   * A provider timeout leaves the intent `requires_action` and throws `provider_timeout` — the
   * caller must not create a reservation. A decline throws `business_rule_violation`.
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
    let auth: { providerRef: string; brand: string; last4: string };
    try {
      auth = await this.port.authorize({
        idempotencyKey: `${input.reservationReference}:${purpose}`,
        amountMinor: input.amountMinor,
        currency: input.currency,
        token: input.token,
        reference: input.reservationReference,
      });
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
      throw err;
    }

    await this.db
      .update(paymentIntent)
      .set({
        state: 'authorized',
        providerRef: auth.providerRef,
        methodBrand: auth.brand,
        methodLast4: auth.last4,
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
      const cap = await this.port.capture(auth.providerRef, input.amountMinor);
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
    const res = await this.port.refund(intent.providerRef!, amountMinor);
    const refundedMinor = intent.refundedMinor + amountMinor;
    const state = refundedMinor >= intent.amountMinor ? 'refunded' : 'partially_refunded';
    await this.db
      .update(paymentIntent)
      .set({ refundedMinor, state, updatedAt: sql`now()` })
      .where(eq(paymentIntent.id, intent.id));
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

  async listReconciliationExceptions() {
    return this.db
      .select()
      .from(reconciliationException)
      .where(eq(reconciliationException.state, 'open'))
      .orderBy(desc(reconciliationException.createdAt))
      .limit(200);
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
