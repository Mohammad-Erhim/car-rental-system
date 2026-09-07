import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns, actorColumns } from './_helpers';

/** DAT-ORG (SRS §9.2) — organization / market scope; owns locations, policies, roles. */
export const organization = pgTable(
  'organization',
  {
    ...auditColumns,
    ...actorColumns,
    code: text('code').notNull(),
    name: text('name').notNull(),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    defaultLocale: text('default_locale').notNull().default('en'),
    supportedLocales: jsonb('supported_locales')
      .$type<string[]>()
      .notNull()
      .default(sql`'["en"]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({ codeUnq: uniqueIndex('organization_code_unq').on(t.code) }),
);

/** DAT-LOCATION (SRS §9.2) — rental location; unique business code per org; IANA zone. */
export const location = pgTable(
  'location',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    code: text('code').notNull(), // unique per organization
    name: text('name').notNull(),
    timezone: text('timezone').notNull(), // IANA id (SRS-DAT-004)
    /** address as structured + formatted; map suggestion must be confirmed (FR-INT-003) */
    address: jsonb('address')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    latitude: text('latitude'),
    longitude: text('longitude'),
    contact: jsonb('contact')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** regular weekly hours: [{ day: 0-6, open: 'HH:MM', close: 'HH:MM', closed?: bool }] */
    regularHours: jsonb('regular_hours')
      .$type<Array<{ day: number; open?: string; close?: string; closed?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    afterHoursReturn: boolean('after_hours_return').notNull().default(false),
    pickupInstructions: text('pickup_instructions'),
    returnInstructions: text('return_instructions'),
    supportedCategoryCodes: jsonb('supported_category_codes')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    turnaroundMinutes: integer('turnaround_minutes').notNull().default(60),
    status: text('status').notNull().default('active'), // draft|active|archived
  },
  (t) => ({
    codeUnq: uniqueIndex('location_org_code_unq').on(t.organizationId, t.code),
    orgIdx: index('location_org_idx').on(t.organizationId, t.status),
  }),
);

/** Exceptional hours / closures (holiday, maintenance) — impact check on save (FR-CAT-004). */
export const locationHoursException = pgTable(
  'location_hours_exception',
  {
    ...auditColumns,
    ...actorColumns,
    locationId: uuid('location_id').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD in the location's zone
    closed: boolean('closed').notNull().default(true),
    open: time('open'),
    close: time('close'),
    reason: text('reason'),
  },
  (t) => ({ locDateIdx: index('location_hours_exc_idx').on(t.locationId, t.date) }),
);

/** One-way route allowance between two locations (SRC-ONEWAY-ROUTE). Not reciprocal by default. */
export const oneWayRoute = pgTable(
  'one_way_route',
  {
    ...auditColumns,
    ...actorColumns,
    fromLocationId: uuid('from_location_id').notNull(),
    toLocationId: uuid('to_location_id').notNull(),
    isAllowed: boolean('is_allowed').notNull().default(true),
    feeCode: text('fee_code'), // -> lookup_value charge_type
    conditions: text('conditions'),
    effectiveFrom: text('effective_from'),
    effectiveTo: text('effective_to'),
  },
  (t) => ({
    pairUnq: uniqueIndex('one_way_route_pair_unq').on(t.fromLocationId, t.toLocationId),
  }),
);
