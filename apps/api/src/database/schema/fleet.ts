import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-VEHICLE-UNIT (SRS §9.2, FR-FLT-001). A physical car. `state` is the system-fixed
 * `vehicle_state` machine (available|on_rent|prep|maintenance|out_of_service|in_transit…).
 * VIN / plate are bidi-isolated wherever displayed (SRS-I18N-007). Full fleet operations
 * (transfers, maintenance workflow, inspections) land in STAGE-005; STAGE-002 needs read +
 * inventory so availability can count units.
 */
export const vehicleUnit = pgTable(
  'vehicle_unit',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    homeLocationId: uuid('home_location_id').notNull(),
    /** where the unit currently is (defaults to home); availability counts by current location */
    currentLocationId: uuid('current_location_id').notNull(),
    vin: text('vin').notNull(),
    plate: text('plate').notNull(),
    plateCountry: text('plate_country'),
    year: text('year'),
    make: text('make'),
    model: text('model'),
    colour: text('colour'),
    odometerKm: text('odometer_km'),
    state: text('state').notNull().default('available'), // -> lookup 'vehicle_state'
    acquiredOn: text('acquired_on'),
    notes: text('notes'),
    imageRef: text('image_ref'), // stored_object key, or null for the generated fallback art
  },
  (t) => ({
    vinUnq: uniqueIndex('vehicle_unit_vin_unq').on(t.vin),
    plateUnq: uniqueIndex('vehicle_unit_plate_unq').on(t.plate),
    locCatIdx: index('vehicle_unit_loc_cat_idx').on(t.currentLocationId, t.categoryId, t.state),
    orgIdx: index('vehicle_unit_org_idx').on(t.organizationId, t.state),
  }),
);

/**
 * A window in which a unit is not bookable for a non-rental reason — maintenance hold, damage
 * out-of-service, admin block (FR-FLT-006). Availability subtracts any block overlapping the
 * requested window. The full maintenance workflow is STAGE-005; this is the availability-facing
 * record.
 */
export const vehicleBlock = pgTable(
  'vehicle_block',
  {
    ...auditColumns,
    ...actorColumns,
    unitId: uuid('unit_id').notNull(),
    kind: text('kind').notNull().default('maintenance'), // maintenance|damage|admin_block|transfer
    reasonCode: text('reason_code'), // -> lookup 'block_reason'
    startAt: timestamp('start_at', { withTimezone: true, mode: 'string' }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'string' }), // null = open-ended
    note: text('note'),
    status: text('status').notNull().default('active'), // active|released
  },
  (t) => ({
    unitIdx: index('vehicle_block_unit_idx').on(t.unitId, t.status),
    windowIdx: index('vehicle_block_window_idx').on(t.startAt, t.endAt),
  }),
);
