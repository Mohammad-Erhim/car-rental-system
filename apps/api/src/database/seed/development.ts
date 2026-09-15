import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';

import { loadEnv } from '../../config/env.schema';
import type { Database } from '../drizzle';
import { customer } from '../schema/customer';
import { account, staffProfile } from '../schema/iam';
import { location, organization } from '../schema/org';

import { seedDiscovery } from './discovery';

/**
 * DEVELOPMENT seed — a small, obviously-synthetic operating set so the apps are usable locally.
 * All identities use example.test addresses and the well-known dev password.
 * NOT loaded in production (SRS-DAT-011).
 */
export const DEV_PASSWORD = 'DevPassw0rd!';

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function seedDevelopment(db: Database): Promise<void> {
  // `loadEnv()` is memoized (env.schema.ts) — this reuses the already-validated env from
  // `bootstrapEnvForScript()` when a CLI entrypoint ran it first, and otherwise validates
  // process.env itself (failing fast if PASSWORD_PEPPER is unset) rather than silently falling
  // back to a hardcoded placeholder for any future caller that skips that bootstrap step.
  const pepper = loadEnv().PASSWORD_PEPPER;
  const passwordHash = await hash(DEV_PASSWORD + pepper, ARGON_OPTS);

  // --- organization ---
  const [org] = await db
    .insert(organization)
    .values({
      code: 'DEMO',
      name: 'Demo Rental Co.',
      defaultCurrency: 'USD',
      defaultLocale: 'en',
      supportedLocales: ['en', 'fr', 'ar'],
    })
    .onConflictDoUpdate({
      target: organization.code,
      set: { name: 'Demo Rental Co.', updatedAt: sql`now()` },
    })
    .returning();

  if (!org) throw new Error('failed to seed organization');

  // --- locations ---
  const locations: Array<{
    code: string;
    name: string;
    timezone: string;
    address: Record<string, string>;
    afterHoursReturn: boolean;
    regularHours: Array<{ day: number; open?: string; close?: string; closed?: boolean }>;
  }> = [
    {
      code: 'JFK',
      name: 'New York JFK Airport',
      timezone: 'America/New_York',
      address: {
        line1: 'JFK Airport, Federal Circle',
        city: 'New York',
        region: 'NY',
        postalCode: '11430',
        country: 'US',
      },
      afterHoursReturn: true,
      regularHours: weekly('06:00', '23:00'),
    },
    {
      code: 'LHR',
      name: 'London Heathrow Airport',
      timezone: 'Europe/London',
      address: {
        line1: 'Heathrow Airport, Northern Perimeter Rd',
        city: 'London',
        postalCode: 'TW6 2QD',
        country: 'GB',
      },
      afterHoursReturn: true,
      regularHours: weekly('06:00', '22:00'),
    },
    {
      code: 'PAR',
      name: 'Paris Downtown — Opéra',
      timezone: 'Europe/Paris',
      address: { line1: '12 Rue Auber', city: 'Paris', postalCode: '75009', country: 'FR' },
      afterHoursReturn: false,
      regularHours: weekly('08:00', '19:00', [0]),
    },
  ];

  for (const l of locations) {
    await db
      .insert(location)
      .values({
        organizationId: org.id,
        code: l.code,
        name: l.name,
        timezone: l.timezone,
        address: l.address,
        afterHoursReturn: l.afterHoursReturn,
        regularHours: l.regularHours,
        pickupInstructions:
          'Proceed to the rental desk in the arrivals hall with your booking reference and driver licence.',
        returnInstructions:
          'Return to the marked rental returns area. Keep the key and complete the checklist.',
        supportedCategoryCodes: ['economy', 'compact', 'intermediate', 'suv', 'premium'],
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [location.organizationId, location.code],
        set: { name: l.name, regularHours: l.regularHours, updatedAt: sql`now()` },
      });
  }

  // --- staff accounts ---
  const staff = [
    { email: 'admin@example.test', name: 'Dev Admin', roles: ['administrator'] },
    { email: 'manager@example.test', name: 'Dev Manager', roles: ['manager'] },
    { email: 'agent@example.test', name: 'Dev Agent', roles: ['rental_agent'] },
    { email: 'fleet@example.test', name: 'Dev Fleet', roles: ['fleet_staff'] },
    { email: 'finance@example.test', name: 'Dev Finance', roles: ['finance_staff'] },
  ];

  for (const s of staff) {
    const [acc] = await db
      .insert(account)
      .values({
        kind: 'staff',
        email: s.email,
        emailNormalized: s.email.toLowerCase(),
        emailVerifiedAt: sql`now()`,
        passwordHash,
        status: 'active',
        displayName: s.name,
        localeCode: 'en',
      })
      .onConflictDoUpdate({
        target: account.emailNormalized,
        set: { displayName: s.name, status: 'active', updatedAt: sql`now()` },
      })
      .returning();
    if (!acc) continue;

    await db
      .insert(staffProfile)
      .values({
        accountId: acc.id,
        organizationId: org.id,
        locationScope: [],
        roleCodes: s.roles,
        approvalLimitMinor:
          s.roles.includes('manager') || s.roles.includes('administrator') ? 500000 : 20000,
        status: 'active',
        activatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: staffProfile.accountId,
        set: { roleCodes: s.roles, status: 'active', updatedAt: sql`now()` },
      });
  }

  // --- demo customer ---
  const custEmail = 'customer@example.test';
  const [custAcc] = await db
    .insert(account)
    .values({
      kind: 'customer',
      email: custEmail,
      emailNormalized: custEmail,
      emailVerifiedAt: sql`now()`,
      passwordHash,
      status: 'active',
      displayName: 'Demo Customer',
      localeCode: 'en',
      phone: '+15555550123',
    })
    .onConflictDoUpdate({
      // the demo customer is a fixture — re-seeding restores a known baseline
      target: account.emailNormalized,
      set: {
        status: 'active',
        displayName: 'Demo Customer',
        localeCode: 'en',
        updatedAt: sql`now()`,
      },
    })
    .returning();

  // domain profile row — the register/verify flow creates this; the seed must mirror it so the
  // demo customer can edit their profile & preferences (FR-IAM-006).
  if (custAcc) {
    await db
      .insert(customer)
      .values({
        accountId: custAcc.id,
        organizationId: org.id,
        fullName: 'Demo Customer',
        email: custEmail,
        emailNormalized: custEmail,
        phone: '+15555550123',
        localeCode: 'en',
        communicationPrefs: { marketingEmail: false },
        consents: [{ type: 'account_terms', version: '1.0', acceptedAt: new Date().toISOString() }],
        status: 'active',
      })
      .onConflictDoUpdate({
        target: customer.accountId,
        set: {
          status: 'active',
          fullName: 'Demo Customer',
          localeCode: 'en',
          communicationPrefs: { marketingEmail: false },
          updatedAt: sql`now()`,
        },
      });
  }

  // seedImages: a first-time install shouldn't start with every vehicle category/unit imageRef
  // null — render + store the same on-brand car-class art apps/site already falls back to (see
  // car-art.ts) so object storage (and every screen that displays a category/unit photo) has
  // something real from the very first `pnpm db:seed`, not just a text placeholder.
  await seedDiscovery(db, org.id, { seedImages: true });
}

function weekly(open: string, close: string, closedDays: number[] = []) {
  return Array.from({ length: 7 }, (_, day) =>
    closedDays.includes(day) ? { day, closed: true } : { day, open, close },
  );
}
