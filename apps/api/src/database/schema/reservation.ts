import { sql } from 'drizzle-orm';
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
 * DAT-RESERVATION (SRS §9.2, FR-BKG-*). A confirmed (or pending) booking created from a
 * STAGE-002 hold + quote. `lines` are a verbatim snapshot of the priced quote (+ extras priced
 * at confirm) so a later rate-plan publish never changes an accepted reservation (SRS-PRC-004).
 * `state` is the system-fixed `reservation_state` machine.
 */
export const reservation = pgTable(
  'reservation',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    reference: text('reference').notNull(),
    state: text('state').notNull().default('pending'), // pending|confirmed|cancelled|expired|no_show|fulfilled
    /** the account that owns it, or null for a guest booking (see holderKey / accessTokenHash) */
    accountId: uuid('account_id'),
    customerId: uuid('customer_id'),
    holderKey: text('holder_key'),
    /** sha-256 of the guest magic-link token (SCREEN-CUS-018) */
    accessTokenHash: text('access_token_hash'),

    categoryCode: text('category_code').notNull(),
    pickupLocationCode: text('pickup_location_code').notNull(),
    returnLocationCode: text('return_location_code').notNull(),
    pickupAt: timestamp('pickup_at', { withTimezone: true, mode: 'string' }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true, mode: 'string' }).notNull(),
    durationHours: integer('duration_hours').notNull(),

    quoteReference: text('quote_reference').notNull(),
    quoteVersion: integer('quote_version').notNull(),
    holdId: uuid('hold_id'),

    currency: text('currency').notNull(),
    subtotalMinor: integer('subtotal_minor').notNull(),
    taxMinor: integer('tax_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    /** amount successfully authorized/captured so far */
    paidMinor: integer('paid_minor').notNull().default(0),

    /** who created it: 'customer' | 'guest' | 'staff' */
    channel: text('channel').notNull().default('customer'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
    cancelReasonCode: text('cancel_reason_code'),
  },
  (t) => ({
    refUnq: uniqueIndex('reservation_reference_unq').on(t.reference),
    stateIdx: index('reservation_state_idx').on(t.organizationId, t.state),
    ownerIdx: index('reservation_owner_idx').on(t.accountId, t.state),
    quoteIdx: index('reservation_quote_idx').on(t.quoteReference),
  }),
);

/** Snapshot of one priced line (time / fee / extra / protection / tax). Never re-priced at read. */
export const reservationLine = pgTable(
  'reservation_line',
  {
    ...auditColumns,
    reservationId: uuid('reservation_id').notNull(),
    kind: text('kind').notNull(), // time|fee|surcharge|discount|extra|protection|tax
    code: text('code').notNull(),
    label: text('label').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitMinor: integer('unit_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ resIdx: index('reservation_line_res_idx').on(t.reservationId, t.sortOrder) }),
);

/** A driver / payer attached to the reservation (reused from a saved driver or entered fresh). */
export const reservationDriver = pgTable(
  'reservation_driver',
  {
    ...auditColumns,
    ...actorColumns,
    reservationId: uuid('reservation_id').notNull(),
    role: text('role').notNull().default('primary_renter'), // primary_renter|additional|payer
    savedDriverId: uuid('saved_driver_id'),
    fullName: text('full_name').notNull(),
    dateOfBirth: text('date_of_birth'),
    email: text('email'),
    phone: text('phone'),
    licenceNumber: text('licence_number'),
    licenceCountry: text('licence_country'),
    licenceExpiresOn: text('licence_expires_on'),
    /** eligibility evaluation cache at time of booking */
    eligibility: jsonb('eligibility').$type<Record<string, unknown>>(),
  },
  (t) => ({ resIdx: index('reservation_driver_res_idx').on(t.reservationId, t.role) }),
);

/** Append-only consent capture (terms version + accepted-at + actor). Never rewritten. */
export const consentSnapshot = pgTable(
  'consent_snapshot',
  {
    ...auditColumns,
    reservationId: uuid('reservation_id').notNull(),
    kind: text('kind').notNull(), // rental_terms|privacy|marketing
    documentVersion: text('document_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
    actorType: text('actor_type').notNull().default('customer'),
    actorId: uuid('actor_id'),
    ipHash: text('ip_hash'),
  },
  (t) => ({ resIdx: index('consent_snapshot_res_idx').on(t.reservationId, t.kind) }),
);
