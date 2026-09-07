import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../drizzle';
import { vehicleCategory, vehicleCategoryFeature, vehicleFeature } from '../schema/catalogue';
import { vehicleUnit } from '../schema/fleet';
import { location } from '../schema/org';
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
    makes: [
      ['Toyota', 'Aygo', 'White'],
      ['Kia', 'Picanto', 'Silver'],
      ['Hyundai', 'i10', 'Blue'],
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
      ['Honda', 'Civic', 'Black'],
      ['Nissan', 'Sentra', 'White'],
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
    fleetPerLocation: 2,
    makes: [
      ['BMW', '3 Series', 'Black'],
      ['Mercedes-Benz', 'C-Class', 'Silver'],
      ['Audi', 'A4', 'Grey'],
    ],
  },
];

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
          })
          .onConflictDoNothing({ target: vehicleUnit.vin });
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
}
