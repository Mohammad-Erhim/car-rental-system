import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-CUSTOMER (SRS §9.2) — customer master data. Links to `account` optionally (guest
 * customers have no account until they link). Verified fields + preference versions.
 */
export const customer = pgTable(
  'customer',
  {
    ...auditColumns,
    ...actorColumns,
    accountId: uuid('account_id'),
    organizationId: uuid('organization_id').notNull(),
    /** display name as entered; historical agreements keep their own snapshot */
    fullName: text('full_name').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    phone: text('phone'),
    localeCode: text('locale_code').notNull().default('en'),
    timezone: text('timezone'),
    address: jsonb('address')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** communication preferences: { marketingEmail: bool, marketingSms: bool, ... } */
    communicationPrefs: jsonb('communication_prefs')
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** consent records: [{ type, version, acceptedAt, actor }] append-only */
    consents: jsonb('consents')
      .$type<Array<{ type: string; version: string; acceptedAt: string; actor?: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('active'), // active | closed | merged
    mergedIntoId: uuid('merged_into_id'),
  },
  (t) => ({
    accountIdx: uniqueIndex('customer_account_unq').on(t.accountId),
    orgEmailIdx: index('customer_org_email_idx').on(t.organizationId, t.emailNormalized),
  }),
);

/**
 * DAT-DRIVER (SRS §9.2) — renter / additional driver. Belongs to a customer (saved) or is a
 * reservation snapshot (STAGE-003). Eligibility facts; sensitive; access scoped.
 */
export const driver = pgTable(
  'driver',
  {
    ...auditColumns,
    ...actorColumns,
    customerId: uuid('customer_id'),
    /** null customerId + reservationId set => snapshot driver (added STAGE-003) */
    reservationId: uuid('reservation_id'),
    role: text('role').notNull().default('additional'), // primary_renter | additional | payer
    fullName: text('full_name').notNull(),
    dateOfBirth: text('date_of_birth'), // YYYY-MM-DD
    email: text('email'),
    phone: text('phone'),
    licenceNumber: text('licence_number'),
    licenceCountry: text('licence_country'), // -> lookup country
    licenceType: text('licence_type'), // -> lookup licence_type
    licenceIssuedOn: text('licence_issued_on'),
    licenceExpiresOn: text('licence_expires_on'),
    /** eligibility evaluation result cache: { status, checkedAt, reasons[] } — recomputed per booking */
    eligibilitySummary: jsonb('eligibility_summary').$type<Record<string, unknown>>(),
    isSavedForReuse: boolean('is_saved_for_reuse').notNull().default(true),
  },
  (t) => ({
    customerIdx: index('driver_customer_idx').on(t.customerId),
    reservationIdx: index('driver_reservation_idx').on(t.reservationId),
  }),
);

/**
 * DAT-DOCUMENT (driver/vehicle/evidence). Content in object storage via `stored_object`;
 * this row is the domain-owned record with type, expiry, review state.
 */
export const driverDocument = pgTable(
  'driver_document',
  {
    ...auditColumns,
    ...actorColumns,
    driverId: uuid('driver_id'),
    customerId: uuid('customer_id'),
    docType: text('doc_type').notNull(), // -> lookup document_type
    objectId: uuid('object_id'), // -> stored_object.id
    issuedOn: text('issued_on'),
    expiresOn: text('expires_on'),
    reviewState: text('review_state').notNull().default('pending'), // pending | verified | rejected
    reviewReason: text('review_reason'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    driverIdx: index('driver_document_driver_idx').on(t.driverId),
    customerIdx: index('driver_document_customer_idx').on(t.customerId),
  }),
);

/**
 * DAT-CASE (privacy variant) — FR-IAM-008 account data access / correction / closure requests.
 * Blockers (active rental, unpaid balance, dispute, retention) are disclosed before closure.
 */
export const privacyRequest = pgTable(
  'privacy_request',
  {
    ...auditColumns,
    ...actorColumns,
    accountId: uuid('account_id').notNull(),
    customerId: uuid('customer_id'),
    kind: text('kind').notNull(), // access | correction | closure
    status: text('status').notNull().default('received'),
    // received | in_review | completed | rejected | cancelled | blocked
    blockers: jsonb('blockers')
      .$type<Array<{ code: string; detail: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    detail: text('detail'),
    resolutionNote: text('resolution_note'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({ accountIdx: index('privacy_request_account_idx').on(t.accountId, t.status) }),
);

/**
 * Customer eligibility restriction / review flag (FR-ADM-002). Free-text notes alone cannot
 * enforce a denial — a restriction row does. Scoped + time-bounded + audited.
 */
export const customerRestriction = pgTable(
  'customer_restriction',
  {
    ...auditColumns,
    ...actorColumns,
    customerId: uuid('customer_id').notNull(),
    category: text('category').notNull(), // review | block
    scope: text('scope').notNull().default('all'), // all | category:<code> | location:<code>
    reasonCode: text('reason_code'), // -> lookup
    evidenceRef: text('evidence_ref'),
    /** pending_review → active | rejected; an active row → lifted (FR-ADM-002 approval path) */
    status: text('status').notNull().default('active'),
    reviewNotes: text('review_notes'),
    approvedBy: uuid('approved_by'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'string' }),
    effectiveTo: timestamp('effective_to', { withTimezone: true, mode: 'string' }),
    customerNotified: boolean('customer_notified').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({ customerIdx: index('customer_restriction_customer_idx').on(t.customerId, t.isActive) }),
);

/**
 * Reversible customer merge (FR-ADM-001 "duplicate review before merge"). Records which rows moved
 * from the duplicate to the survivor so an `unmerge` can put them back. Never deleted.
 */
export const customerMerge = pgTable(
  'customer_merge',
  {
    ...auditColumns,
    ...actorColumns,
    survivorId: uuid('survivor_id').notNull(),
    mergedId: uuid('merged_id').notNull(),
    reason: text('reason'),
    movedDrivers: jsonb('moved_drivers')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    movedRestrictions: jsonb('moved_restrictions')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    movedReservations: jsonb('moved_reservations')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'string' }),
    reversedBy: uuid('reversed_by'),
  },
  (t) => ({
    survivorIdx: index('customer_merge_survivor_idx').on(t.survivorId),
    mergedIdx: index('customer_merge_merged_idx').on(t.mergedId),
  }),
);
