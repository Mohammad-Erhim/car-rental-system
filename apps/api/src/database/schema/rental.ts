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
 * DAT-RENTAL (SRS §9.2, FR-RNT-*). The physical rental created when a reservation is picked up.
 * A specific `unitId` is assigned; `state` is the system-fixed `rental_state` machine
 * (awaiting_pickup | active | overdue | returned | closed). The partial unique index on
 * `unitId WHERE state in ('awaiting_pickup','active','overdue')` enforces "one open rental per
 * unit" — 'awaiting_pickup' is included because a unit is already committed to a rental the
 * moment it's assigned, not only once it's physically on rent; without it, the same unit could
 * be assigned to two different reservations before either is picked up.
 */
export const rental = pgTable(
  'rental',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    reference: text('reference').notNull(),
    reservationReference: text('reservation_reference').notNull(),
    unitId: uuid('unit_id'),
    state: text('state').notNull().default('awaiting_pickup'),

    pickupLocationCode: text('pickup_location_code').notNull(),
    returnLocationCode: text('return_location_code').notNull(),
    scheduledPickupAt: timestamp('scheduled_pickup_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    scheduledReturnAt: timestamp('scheduled_return_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true, mode: 'string' }),
    returnedAt: timestamp('returned_at', { withTimezone: true, mode: 'string' }),

    odometerOutKm: integer('odometer_out_km'),
    odometerInKm: integer('odometer_in_km'),
    fuelOutPct: integer('fuel_out_pct'),
    fuelInPct: integer('fuel_in_pct'),

    currency: text('currency').notNull(),
    /** running settlement: charges captured beyond the reservation total, minus refunds */
    settlementMinor: integer('settlement_minor').notNull().default(0),

    agreementVersion: text('agreement_version'),
    agreementAcceptedAt: timestamp('agreement_accepted_at', { withTimezone: true, mode: 'string' }),
    /**
     * The fuel-recharge rate disclosed in the rental agreement, snapshotted at pickup alongside
     * `agreementVersion`. A later Configuration → Policy change to `fuel_rate` never re-rates a
     * rental already on the road (FR-PAY-007). Null for rentals picked up before this column
     * existed — `return()` falls back to the live policy for those.
     */
    fuelPolicy: jsonb('fuel_policy').$type<{ minorPerPct: number }>(),
  },
  (t) => ({
    refUnq: uniqueIndex('rental_reference_unq').on(t.reference),
    resIdx: index('rental_reservation_idx').on(t.reservationReference),
    stateIdx: index('rental_state_idx').on(t.organizationId, t.state),
    openUnitUnq: uniqueIndex('rental_open_unit_unq')
      .on(t.unitId)
      .where(sql`state in ('awaiting_pickup','active','overdue')`),
  }),
);

/** Append-only rental history (assigned / picked_up / extended / incident / returned / closed). */
export const rentalEvent = pgTable(
  'rental_event',
  {
    ...auditColumns,
    rentalId: uuid('rental_id').notNull(),
    reference: text('reference').notNull(),
    type: text('type').notNull(),
    reasonCode: text('reason_code'),
    note: text('note'),
    amountDeltaMinor: integer('amount_delta_minor').notNull().default(0),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    actorType: text('actor_type').notNull().default('staff'),
    actorId: uuid('actor_id'),
    actorLabel: text('actor_label'),
  },
  (t) => ({ rentalIdx: index('rental_event_rental_idx').on(t.rentalId, t.createdAt) }),
);

/**
 * DAT-INSPECTION (SRS §9.2, FR-RNT-011). Captured at return; a damage charge must reference a
 * finding on this inspection.
 */
export const inspection = pgTable(
  'inspection',
  {
    ...auditColumns,
    ...actorColumns,
    rentalId: uuid('rental_id').notNull(),
    kind: text('kind').notNull().default('return'), // pickup | return
    outcome: text('outcome').notNull().default('pass'), // pass | issues
    checklist: jsonb('checklist')
      .$type<Array<{ item: string; ok: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => ({ rentalIdx: index('inspection_rental_idx').on(t.rentalId, t.kind) }),
);

export const inspectionFinding = pgTable(
  'inspection_finding',
  {
    ...auditColumns,
    inspectionId: uuid('inspection_id').notNull(),
    area: text('area').notNull(),
    severity: text('severity').notNull().default('minor'), // minor | major
    description: text('description').notNull(),
    chargeMinor: integer('charge_minor').notNull().default(0),
  },
  (t) => ({ inspIdx: index('inspection_finding_insp_idx').on(t.inspectionId) }),
);
