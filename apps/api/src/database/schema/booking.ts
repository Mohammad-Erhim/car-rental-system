import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-HOLD (SRS §9.2, FR-BKG-001 / FR-PRC-006). A short, expiring reservation of capacity for a
 * category at a pickup location + window, placed when a customer takes a quote toward checkout.
 * Availability subtracts every `active` hold whose window overlaps the request. Created only via
 * `availability.checkAndHold()` inside a transaction so two customers cannot both take the last
 * unit. Released on expiry (worker), on confirmation, or on abandon.
 */
export const hold = pgTable(
  'hold',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    categoryCode: text('category_code').notNull(),
    pickupLocationCode: text('pickup_location_code').notNull(),
    returnLocationCode: text('return_location_code').notNull(),
    pickupAt: timestamp('pickup_at', { withTimezone: true, mode: 'string' }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true, mode: 'string' }).notNull(),
    /** who holds it — an account, or an anonymous checkout session key */
    holderKey: text('holder_key').notNull(),
    quoteReference: text('quote_reference'),
    status: text('status').notNull().default('active'), // active|released|consumed|expired
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'string' }),
    releaseReason: text('release_reason'), // expired|abandoned|confirmed|forced
  },
  (t) => ({
    liveIdx: index('hold_live_idx').on(
      t.organizationId,
      t.categoryCode,
      t.pickupLocationCode,
      t.status,
    ),
    windowIdx: index('hold_window_idx').on(t.pickupAt, t.returnAt),
    expiryIdx: index('hold_expiry_idx').on(t.status, t.expiresAt),
  }),
);
