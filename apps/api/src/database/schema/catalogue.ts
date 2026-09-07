import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-VEHICLE-CATEGORY (SRS §9.2, FR-CAT-001). The bookable class a customer chooses — units are
 * assigned from the class at/near pickup. `code` is stable; the display name/description are
 * translated via `translation` (namespace `catalogue`).
 */
export const vehicleCategory = pgTable(
  'vehicle_category',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    code: text('code').notNull(), // stable, unique per org, e.g. 'economy'
    /** SIPP-ish class grouping for sort/marketing: economy|compact|intermediate|standard|fullsize|premium|luxury|suv|van */
    class: text('class').notNull().default('standard'),
    displayName: text('display_name').notNull(), // source/default label
    description: text('description'),
    /** indicative specs shown on the card; not availability-affecting */
    passengers: integer('passengers').notNull().default(5),
    luggage: integer('luggage').notNull().default(2),
    doors: integer('doors').notNull().default(4),
    transmission: text('transmission').notNull().default('automatic'), // automatic|manual
    imageRef: text('image_ref'), // stored_object key or external ref (confirmed, FR-INT-003)
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    codeUnq: uniqueIndex('vehicle_category_org_code_unq').on(t.organizationId, t.code),
    activeIdx: index('vehicle_category_active_idx').on(t.organizationId, t.isActive),
  }),
);

/**
 * DAT-VEHICLE-FEATURE (FR-CAT-002). Feature/amenity shown on a category or unit. Backed by the
 * `vehicle_feature` lookup for the code set; this table adds per-org presentation + grouping.
 */
export const vehicleFeature = pgTable(
  'vehicle_feature',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    code: text('code').notNull(), // -> lookup_value 'vehicle_feature'
    label: text('label').notNull(),
    group: text('group').notNull().default('comfort'), // comfort|safety|tech|utility
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({ codeUnq: uniqueIndex('vehicle_feature_org_code_unq').on(t.organizationId, t.code) }),
);

/** Category ↔ feature map (many-to-many). Ordered for display. */
export const vehicleCategoryFeature = pgTable(
  'vehicle_category_feature',
  {
    ...auditColumns,
    categoryId: uuid('category_id').notNull(),
    featureCode: text('feature_code').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    pairUnq: uniqueIndex('vehicle_category_feature_unq').on(t.categoryId, t.featureCode),
  }),
);
