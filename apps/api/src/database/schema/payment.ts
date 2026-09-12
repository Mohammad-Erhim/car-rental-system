import {
  boolean,
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
    /** Stripe only — the customer + payment method behind this charge, saved on the *first*
     *  (booking) intent so a later extension/incidental charge on the same reservation can be
     *  an off-session reuse instead of asking the guest to re-enter a card (FR-PAY / DEC-006
     *  follow-up). Always null under the simulator. */
    providerCustomerRef: text('provider_customer_ref'),
    providerMethodRef: text('provider_method_ref'),
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

/**
 * DAT-PAYMENT-PROVIDER-CONFIG (SCREEN-OPS-041, FR-PAY-010). One row per organization — the
 * dashboard-configurable payment driver switch (simulator | stripe_test | stripe_live) plus the
 * Stripe credentials for each Stripe mode. Secret keys are never stored in plaintext: only the
 * AES-256-GCM ciphertext (secret-cipher.ts) is persisted, decrypted in memory only for the
 * instant a `StripePaymentAdapter` needs it to call the Stripe API. `*KeyLast4`/`*ConfiguredAt`
 * are plaintext-safe display metadata so the settings screen can show "configured, ending 4242"
 * without ever round-tripping the real key back to a browser. Writes are `payment.manage`-gated
 * (administrator only, never bundled into the generic 'ALL' role grant) and step-up-confirmed —
 * this is the one config screen in the app that can move real money.
 */
export const paymentProviderConfig = pgTable('payment_provider_config', {
  ...auditColumns,
  ...actorColumns,
  organizationId: uuid('organization_id').notNull().unique(),
  activeDriver: text('active_driver').notNull().default('simulator'), // simulator|stripe_test|stripe_live
  testPublishableKey: text('test_publishable_key'),
  testSecretKeyCiphertext: text('test_secret_key_ciphertext'),
  testSecretKeyLast4: text('test_secret_key_last4'),
  testWebhookSecretCiphertext: text('test_webhook_secret_ciphertext'),
  testConfiguredAt: timestamp('test_configured_at', { withTimezone: true, mode: 'string' }),
  livePublishableKey: text('live_publishable_key'),
  liveSecretKeyCiphertext: text('live_secret_key_ciphertext'),
  liveSecretKeyLast4: text('live_secret_key_last4'),
  liveWebhookSecretCiphertext: text('live_webhook_secret_ciphertext'),
  liveConfiguredAt: timestamp('live_configured_at', { withTimezone: true, mode: 'string' }),
  /** a lightweight real Stripe API call (`balance.retrieve`) made at save time so a bad key is
   *  rejected immediately rather than discovered on a guest's actual checkout (FR-PAY-010). */
  testKeyVerifiedAt: timestamp('test_key_verified_at', { withTimezone: true, mode: 'string' }),
  liveKeyVerifiedAt: timestamp('live_key_verified_at', { withTimezone: true, mode: 'string' }),
  liveModeAcknowledged: boolean('live_mode_acknowledged').notNull().default(false),
});
