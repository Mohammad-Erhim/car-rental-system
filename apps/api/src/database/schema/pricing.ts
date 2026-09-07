import { sql } from 'drizzle-orm';
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
 * DAT-RATE-PLAN (SRS §9.2, FR-PRC-001). A versioned price book for a category (optionally scoped
 * to a location) over a date range. Publishing creates a new immutable version; a quote records
 * the exact `ratePlanId` + `ratePlanVersion` it was priced from, so a later publish never
 * changes an issued quote (SRS-PRC-004).
 */
export const ratePlan = pgTable(
  'rate_plan',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    categoryCode: text('category_code').notNull(),
    /** null = applies to every location that supports the category */
    locationCode: text('location_code'),
    currency: text('currency').notNull().default('USD'),
    name: text('name').notNull(),
    /** inclusive date range in which this plan may price a rental pickup (location-local dates) */
    effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD
    effectiveTo: text('effective_to'), // null = open-ended
    /** base per-day price in minor units; tiers refine by duration */
    baseDayMinor: integer('base_day_minor').notNull(),
    /** extra per-hour price for a partial trailing day, minor units */
    hourMinor: integer('hour_minor').notNull().default(0),
    minDurationHours: integer('min_duration_hours').notNull().default(24),
    maxDurationHours: integer('max_duration_hours'), // null = no cap
    /** flat mandatory fees always added, [{ code, label, amountMinor, taxable }] */
    fees: jsonb('fees')
      .$type<Array<{ code: string; label: string; amountMinor: number; taxable?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** tax rate in basis points applied to the taxable subtotal (e.g. 2000 = 20%) */
    taxBps: integer('tax_bps').notNull().default(0),
    status: text('status').notNull().default('draft'), // draft|in_review|published|retired
    publishedVersion: integer('published_version').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    publishedBy: uuid('published_by'),
  },
  (t) => ({
    lookupIdx: index('rate_plan_lookup_idx').on(
      t.organizationId,
      t.categoryCode,
      t.locationCode,
      t.status,
    ),
    rangeIdx: index('rate_plan_range_idx').on(t.effectiveFrom, t.effectiveTo),
  }),
);

/**
 * Duration tier — a per-day price that applies once the rental reaches `minHours`. The highest
 * `minHours` not exceeding the rental duration wins; if none match, `ratePlan.baseDayMinor` is
 * used. Lets weekly/monthly rates be cheaper per day.
 */
export const rateTier = pgTable(
  'rate_tier',
  {
    ...auditColumns,
    ratePlanId: uuid('rate_plan_id').notNull(),
    minHours: integer('min_hours').notNull(),
    dayMinor: integer('day_minor').notNull(),
  },
  (t) => ({ planIdx: uniqueIndex('rate_tier_plan_minhours_unq').on(t.ratePlanId, t.minHours) }),
);

/**
 * DAT-QUOTE (SRS §9.2, FR-PRC-005). An itemised, versioned, expiring price for a specific
 * category + location + window. `lines` sum to `totalMinor` (invariant, tested). Superseded by a
 * new `version` on re-quote; never mutated in place.
 */
export const quote = pgTable(
  'quote',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    reference: text('reference').notNull(), // human-facing, stable across versions
    version: integer('quote_version').notNull().default(1),
    status: text('status').notNull().default('active'), // active|superseded|expired|consumed
    categoryCode: text('category_code').notNull(),
    pickupLocationCode: text('pickup_location_code').notNull(),
    returnLocationCode: text('return_location_code').notNull(),
    pickupAt: timestamp('pickup_at', { withTimezone: true, mode: 'string' }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true, mode: 'string' }).notNull(),
    durationHours: integer('duration_hours').notNull(),
    currency: text('currency').notNull(),
    ratePlanId: uuid('rate_plan_id').notNull(),
    ratePlanVersion: integer('rate_plan_version').notNull(),
    subtotalMinor: integer('subtotal_minor').notNull(),
    taxMinor: integer('tax_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    /** the hold placed when this quote was taken toward checkout, if any */
    holdId: uuid('hold_id'),
  },
  (t) => ({
    refVerUnq: uniqueIndex('quote_reference_version_unq').on(t.reference, t.version),
    statusIdx: index('quote_status_idx').on(t.organizationId, t.status, t.expiresAt),
  }),
);

/** One priced line of a quote. `kind` groups them; `amountMinor` is signed (discounts negative). */
export const quoteLine = pgTable(
  'quote_line',
  {
    ...auditColumns,
    quoteId: uuid('quote_id').notNull(),
    kind: text('kind').notNull(), // time|fee|surcharge|discount|tax
    code: text('code').notNull(),
    label: text('label').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitMinor: integer('unit_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    taxable: boolean('taxable').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ quoteIdx: index('quote_line_quote_idx').on(t.quoteId, t.sortOrder) }),
);
