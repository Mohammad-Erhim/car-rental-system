import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-PAYMENT-INTENT (SRS §9.2, FR-PAY-001..003). One row per (reservation, purpose) — the
 * unique index makes a duplicate `confirm()` idempotent: the second attempt finds the existing
 * intent instead of authorizing again. `state` is the system-fixed `payment_state` machine.
 * Card data never touches this system — the `PaymentPort` returns opaque tokens + brand/last4.
 */
export const paymentIntent = pgTable(
  'payment_intent',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    reservationReference: text('reservation_reference').notNull(),
    purpose: text('purpose').notNull().default('booking'), // booking|extension|incidental|adjustment
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    state: text('state').notNull().default('requires_action'),
    // requires_action|authorized|captured|failed|voided|refunded|partially_refunded
    provider: text('provider').notNull().default('simulator'),
    providerRef: text('provider_ref'),
    methodBrand: text('method_brand'),
    methodLast4: text('method_last4'),
    failureCode: text('failure_code'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true, mode: 'string' }),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }),
    /** amount refunded so far (minor) */
    refundedMinor: integer('refunded_minor').notNull().default(0),
  },
  (t) => ({
    unq: uniqueIndex('payment_intent_res_purpose_unq').on(t.reservationReference, t.purpose),
    stateIdx: index('payment_intent_state_idx').on(t.organizationId, t.state),
  }),
);

/** Ledger row — one per provider transaction (authorize / capture / void / refund). */
export const payment = pgTable(
  'payment',
  {
    ...auditColumns,
    ...actorColumns,
    intentId: uuid('intent_id').notNull(),
    reservationReference: text('reservation_reference').notNull(),
    type: text('type').notNull(), // authorize|capture|void|refund
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    outcome: text('outcome').notNull(), // succeeded|failed|pending
    providerRef: text('provider_ref'),
    failureCode: text('failure_code'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  (t) => ({
    intentIdx: index('payment_intent_idx').on(t.intentId),
    resIdx: index('payment_res_idx').on(t.reservationReference),
  }),
);

/**
 * DAT-CASE (SRS §9.2, FR-INT-002 / TEST-ERR-004). An owned recovery item — created when a
 * consequential step fails after money moved (e.g. reservation write fails after a successful
 * authorize) so the inconsistency is visible and worked, never silent. Full case management is
 * STAGE-004/005; this is the write side.
 */
export const recoveryCase = pgTable(
  'recovery_case',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    kind: text('kind').notNull(), // payment_orphan|write_after_charge|refund_stuck|reconcile
    severity: text('severity').notNull().default('high'),
    state: text('state').notNull().default('open'), // open|in_progress|resolved
    subjectType: text('subject_type').notNull(),
    subjectRef: text('subject_ref').notNull(),
    summary: text('summary').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    resolutionNote: text('resolution_note'),
  },
  (t) => ({
    openIdx: index('recovery_case_open_idx').on(t.organizationId, t.state, t.severity),
    subjectIdx: index('recovery_case_subject_idx').on(t.subjectType, t.subjectRef),
  }),
);
