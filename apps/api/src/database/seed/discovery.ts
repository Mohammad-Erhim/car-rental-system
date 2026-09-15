import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../drizzle';
import {
  product,
  vehicleCategory,
  vehicleCategoryFeature,
  vehicleFeature,
} from '../schema/catalogue';
import { vehicleUnit } from '../schema/fleet';
import { location } from '../schema/org';
import { storedObject } from '../schema/platform';
import { ratePlan, rateTier } from '../schema/pricing';

export interface CategorySpec {
  code: string;
  klass: string;
  name: string;
  passengers: number;
  luggage: number;
  doors: number;
  transmission: 'automatic' | 'manual';
  baseDayMinor: number;
  features: string[];
  fleetPerLocation: number;
  makes: Array<[string, string, string]>;
}

export const FEATURES: Array<{ code: string; label: string; group: string }> = [
  { code: 'aircon', label: 'Air conditioning', group: 'comfort' },
  { code: 'bluetooth', label: 'Bluetooth', group: 'tech' },
  { code: 'carplay', label: 'Apple CarPlay / Android Auto', group: 'tech' },
  { code: 'cruise', label: 'Cruise control', group: 'comfort' },
  { code: 'parking_sensors', label: 'Parking sensors', group: 'safety' },
  { code: 'awd', label: 'All-wheel drive', group: 'utility' },
  { code: 'leather', label: 'Leather seats', group: 'comfort' },
  { code: 'gps', label: 'Built-in navigation', group: 'tech' },
];

export const CATEGORIES: CategorySpec[] = [
  {
    code: 'economy',
    klass: 'economy',
    name: 'Economy',
    passengers: 5,
    luggage: 1,
    doors: 4,
    transmission: 'automatic',
    baseDayMinor: 3200,
    features: ['aircon', 'bluetooth'],
    fleetPerLocation: 5,
    // one distinct make/model/colour combo per unit — never fewer combos than fleetPerLocation,
    // or `n % makes.length` wraps around and seeds two identical cars at the same location
    makes: [
      ['Toyota', 'Aygo X', 'White'],
      ['Kia', 'Picanto', 'Silver'],
      ['Hyundai', 'i10', 'Blue'],
      ['Volkswagen', 'up!', 'Red'],
      ['Fiat', 'Panda', 'Grey'],
    ],
  },
  {
    code: 'compact',
    klass: 'compact',
    name: 'Compact',
    passengers: 5,
    luggage: 2,
    doors: 4,
    transmission: 'automatic',
    baseDayMinor: 4100,
    features: ['aircon', 'bluetooth', 'carplay', 'cruise'],
    fleetPerLocation: 4,
    makes: [
      ['Volkswagen', 'Golf', 'Grey'],
      ['Ford', 'Focus', 'Blue'],
      ['Mazda', '3', 'Red'],
      ['Honda', 'Civic', 'White'],
    ],
  },
  {
    code: 'intermediate',
    klass: 'intermediate',
    name: 'Intermediate',
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    baseDayMinor: 5200,
    features: ['aircon', 'carplay', 'cruise', 'parking_sensors', 'gps'],
    fleetPerLocation: 4,
    makes: [
      ['Toyota', 'Corolla', 'Silver'],
      ['Nissan', 'Sentra', 'White'],
      ['Hyundai', 'Elantra', 'Black'],
      ['Skoda', 'Octavia', 'Blue'],
    ],
  },
  {
    code: 'suv',
    klass: 'suv',
    name: 'SUV',
    passengers: 5,
    luggage: 4,
    doors: 5,
    transmission: 'automatic',
    baseDayMinor: 7400,
    features: ['aircon', 'carplay', 'cruise', 'parking_sensors', 'awd', 'gps'],
    fleetPerLocation: 3,
    makes: [
      ['Toyota', 'RAV4', 'Grey'],
      ['Volkswagen', 'Tiguan', 'Blue'],
      ['Nissan', 'X-Trail', 'Black'],
    ],
  },
  {
    code: 'premium',
    klass: 'premium',
    name: 'Premium',
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    baseDayMinor: 11800,
    features: ['aircon', 'carplay', 'cruise', 'parking_sensors', 'leather', 'gps'],
    // kept at 2 — apps/api/test/discovery.spec.ts TEST-AVL-002 and its callers in booking.spec.ts
    // / reservation-ops.spec.ts deliberately depend on "premium @ TST1 has exactly 2 units" as a
    // capacity-exhaustion fixture
    fleetPerLocation: 2,
    makes: [
      ['BMW', '3 Series', 'Black'],
      ['Mercedes-Benz', 'C-Class', 'Silver'],
    ],
  },
];

// A couple of make/model spellings in CATEGORIES don't exactly match the owner_id an existing
// upload was labeled with (e.g. "Aygo X" seeded here vs. the photo filed under "Aygo") — mapped
// explicitly rather than fuzzy-matched, so a lookup miss stays a *visible* miss (no photo, falls
// back to the client's generated art) instead of silently matching the wrong car.
const MAKE_MODEL_ALIASES: Record<string, string> = {
  Toyota_Aygo_X: 'Toyota_Aygo',
};

function makeModelKey(make: string, model: string): string {
  const key = `${make}_${model}`.replace(/\s+/g, '_');
  return MAKE_MODEL_ALIASES[key] ?? key;
}

/**
 * Real photos already sitting in object storage from an earlier upload (`ops/media`, purpose
 * `vehicle_unit`, `ownerId` labeled `Make_Model`) — this only *links* what's already there to the
 * seeded categories/units by make+model; it never fabricates or fetches new images. A category or
 * unit whose make/model has no matching upload simply keeps `imageRef` unset (the client's
 * existing generated-art fallback covers that, per `vehicleUnit.imageRef`'s own column comment).
 */
async function loadMakeModelPhotoIndex(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ ownerId: storedObject.ownerId, objectKey: storedObject.objectKey })
    .from(storedObject)
    .where(
      and(eq(storedObject.purpose, 'vehicle_unit'), eq(storedObject.ownerType, 'vehicle_unit')),
    );
  const index = new Map<string, string>();
  for (const r of rows) if (r.ownerId) index.set(r.ownerId, r.objectKey);
  return index;
}

/**
 * Seed vehicle categories + features + a small fleet + one published rate plan per category so
 * `POST /discovery/search` returns real, priced, bookable options. Shared by the development and
 * test seeds (SRS §22.3 — deterministic fixtures).
 */
export async function seedDiscovery(
  db: Database,
  orgId: string,
  opts: { categories?: CategorySpec[]; locationCodes?: string[] } = {},
): Promise<void> {
  const categories = opts.categories ?? CATEGORIES;
  const photoIndex = await loadMakeModelPhotoIndex(db);

  for (const [i, f] of FEATURES.entries()) {
    await db
      .insert(vehicleFeature)
      .values({ organizationId: orgId, code: f.code, label: f.label, group: f.group, sortOrder: i })
      .onConflictDoUpdate({
        target: [vehicleFeature.organizationId, vehicleFeature.code],
        set: { label: f.label, group: f.group, isActive: true, updatedAt: sql`now()` },
      });
  }

  const locWhere = opts.locationCodes?.length
    ? and(eq(location.organizationId, orgId), inArray(location.code, opts.locationCodes))
    : eq(location.organizationId, orgId);
  const locs = await db
    .select({ id: location.id, code: location.code })
    .from(location)
    .where(locWhere);

  for (const [ci, cat] of categories.entries()) {
    // The category's own "hero" photo: whichever of its makes has a real upload first, in list
    // order — every category's first-listed make happens to have one today, but this degrades to
    // "no photo" (client fallback art) rather than erroring if that ever stops being true.
    const categoryImageKey = cat.makes
      .map(([mk, md]) => photoIndex.get(makeModelKey(mk, md)))
      .find((key): key is string => !!key);

    const [row] = await db
      .insert(vehicleCategory)
      .values({
        organizationId: orgId,
        code: cat.code,
        class: cat.klass,
        displayName: cat.name,
        description: `${cat.name} class — assigned from the class at pickup.`,
        passengers: cat.passengers,
        luggage: cat.luggage,
        doors: cat.doors,
        transmission: cat.transmission,
        sortOrder: ci,
        isActive: true,
        ...(categoryImageKey ? { imageRef: `obj:${categoryImageKey}` } : {}),
      })
      .onConflictDoUpdate({
        target: [vehicleCategory.organizationId, vehicleCategory.code],
        set: {
          displayName: cat.name,
          class: cat.klass,
          passengers: cat.passengers,
          luggage: cat.luggage,
          doors: cat.doors,
          sortOrder: ci,
          isActive: true,
          updatedAt: sql`now()`,
          ...(categoryImageKey ? { imageRef: `obj:${categoryImageKey}` } : {}),
        },
      })
      .returning();
    const categoryId = row!.id;

    await db
      .delete(vehicleCategoryFeature)
      .where(eq(vehicleCategoryFeature.categoryId, categoryId));
    if (cat.features.length) {
      await db
        .insert(vehicleCategoryFeature)
        .values(cat.features.map((code, i) => ({ categoryId, featureCode: code, sortOrder: i })));
    }

    for (const loc of locs) {
      for (let n = 0; n < cat.fleetPerLocation; n++) {
        const [mk, md, col] = cat.makes[n % cat.makes.length]!;
        const unitImageKey = photoIndex.get(makeModelKey(mk, md));
        const vin =
          `DEV${cat.code.toUpperCase().slice(0, 3)}${loc.code}${String(n + 1).padStart(2, '0')}${'0'.repeat(8)}`.slice(
            0,
            17,
          );
        const plate = `${loc.code}-${cat.code.slice(0, 3).toUpperCase()}${n + 1}`;
        await db
          .insert(vehicleUnit)
          .values({
            organizationId: orgId,
            categoryId,
            homeLocationId: loc.id,
            currentLocationId: loc.id,
            vin,
            plate,
            year: '2024',
            make: mk,
            model: md,
            colour: col,
            state: 'available',
            ...(unitImageKey ? { imageRef: `obj:${unitImageKey}` } : {}),
          })
          .onConflictDoUpdate({
            // re-seeding must correct a previously-wrong make/model/colour on an existing VIN
            // (e.g. this file's own make/model list changing) — but never touch state or
            // currentLocationId, which reflect real operational activity against this unit
            target: vehicleUnit.vin,
            set: {
              make: mk,
              model: md,
              colour: col,
              year: '2024',
              updatedAt: sql`now()`,
              ...(unitImageKey ? { imageRef: `obj:${unitImageKey}` } : {}),
            },
          });
      }
    }

    const [existingPlan] = await db
      .select({ id: ratePlan.id })
      .from(ratePlan)
      .where(and(eq(ratePlan.organizationId, orgId), eq(ratePlan.categoryCode, cat.code)))
      .limit(1);
    if (!existingPlan) {
      const [plan] = await db
        .insert(ratePlan)
        .values({
          organizationId: orgId,
          categoryCode: cat.code,
          locationCode: null,
          currency: 'USD',
          name: `${cat.name} — standard`,
          effectiveFrom: '2020-01-01',
          effectiveTo: null,
          baseDayMinor: cat.baseDayMinor,
          hourMinor: Math.round(cat.baseDayMinor / 6),
          minDurationHours: 24,
          maxDurationHours: 24 * 60,
          taxBps: 2000,
          fees: [
            { code: 'reg_fee', label: 'Vehicle registration fee', amountMinor: 495, taxable: true },
          ],
          status: 'published',
          publishedVersion: 1,
          publishedAt: sql`now()`,
        })
        .returning();
      await db.insert(rateTier).values([
        { ratePlanId: plan!.id, minHours: 168, dayMinor: Math.round(cat.baseDayMinor * 0.85) },
        { ratePlanId: plan!.id, minHours: 720, dayMinor: Math.round(cat.baseDayMinor * 0.7) },
      ]);
    }
  }

  // --- extras & protection products (FR-ADM-006) ---
  const PRODUCTS = [
    {
      code: 'protection_full',
      name: 'Full protection (zero excess)',
      kind: 'protection',
      unitPriceMinor: 2500,
      pricingUnit: 'per_day',
      maxQuantity: 1,
      taxable: true,
      sortOrder: 0,
    },
    {
      code: 'protection_basic',
      name: 'Collision damage waiver',
      kind: 'protection',
      unitPriceMinor: 1500,
      pricingUnit: 'per_day',
      maxQuantity: 1,
      taxable: true,
      sortOrder: 1,
    },
    {
      code: 'additional_driver',
      name: 'Additional driver',
      kind: 'extra',
      unitPriceMinor: 900,
      pricingUnit: 'per_day',
      maxQuantity: 3,
      taxable: true,
      sortOrder: 2,
    },
    {
      code: 'child_seat',
      name: 'Child seat',
      kind: 'extra',
      unitPriceMinor: 700,
      pricingUnit: 'per_rental',
      maxQuantity: 3,
      taxable: true,
      sortOrder: 3,
    },
    {
      code: 'gps',
      name: 'GPS navigation',
      kind: 'extra',
      unitPriceMinor: 600,
      pricingUnit: 'per_day',
      maxQuantity: 1,
      taxable: true,
      sortOrder: 4,
    },
  ];
  for (const p of PRODUCTS) {
    await db
      .insert(product)
      .values({ organizationId: orgId, currency: 'USD', active: true, ...p })
      .onConflictDoUpdate({
        target: [product.organizationId, product.code],
        set: {
          name: p.name,
          kind: p.kind,
          unitPriceMinor: p.unitPriceMinor,
          pricingUnit: p.pricingUnit,
          maxQuantity: p.maxQuantity,
          taxable: p.taxable,
          sortOrder: p.sortOrder,
          active: true,
          updatedAt: sql`now()`,
        },
      });
  }
}
