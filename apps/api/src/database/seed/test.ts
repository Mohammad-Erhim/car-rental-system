import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';

import type { Database } from '../drizzle';
import { account, staffProfile } from '../schema/iam';
import { location, organization } from '../schema/org';

import { seedDiscovery } from './discovery';

/**
 * TEST seed — deterministic fixtures. Builders in the test suite state only meaningful
 * differences on top of this (SRS §22.3). Clearly non-production identities.
 */
export const TEST_PASSWORD = 'Test-Passw0rd!';
export const TEST_ORG_CODE = 'TEST';

export async function seedTest(db: Database): Promise<void> {
  const pepper = process.env.PASSWORD_PEPPER ?? 'test-pepper';
  const passwordHash = await hash(TEST_PASSWORD + pepper, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const [org] = await db
    .insert(organization)
    .values({
      code: TEST_ORG_CODE,
      name: 'Test Org',
      defaultCurrency: 'USD',
      defaultLocale: 'en',
      supportedLocales: ['en', 'fr', 'ar'],
    })
    .onConflictDoUpdate({ target: organization.code, set: { updatedAt: sql`now()` } })
    .returning();
  if (!org) throw new Error('test seed: org');

  const testLocations = [
    {
      code: 'TST1',
      name: 'Test Location 1 (24/7)',
      regularHours: Array.from({ length: 7 }, (_, day) => ({ day, open: '00:00', close: '23:59' })),
      supportedCategoryCodes: ['economy', 'compact', 'intermediate', 'suv', 'premium'],
      afterHoursReturn: true,
    },
    {
      code: 'TST2',
      name: 'Test Location 2 (limited hours, no after-hours)',
      // open 06:00–20:00, closed Sundays (day 0)
      regularHours: Array.from({ length: 7 }, (_, day) =>
        day === 0 ? { day, closed: true } : { day, open: '06:00', close: '20:00' },
      ),
      supportedCategoryCodes: ['economy', 'compact'],
      afterHoursReturn: false,
    },
  ];
  for (const l of testLocations) {
    await db
      .insert(location)
      .values({
        organizationId: org.id,
        code: l.code,
        name: l.name,
        timezone: 'America/New_York',
        address: { line1: '1 Test Way', city: 'Testville', country: 'US' },
        regularHours: l.regularHours,
        supportedCategoryCodes: l.supportedCategoryCodes,
        afterHoursReturn: l.afterHoursReturn,
        turnaroundMinutes: 60,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [location.organizationId, location.code],
        set: {
          regularHours: l.regularHours,
          supportedCategoryCodes: l.supportedCategoryCodes,
          afterHoursReturn: l.afterHoursReturn,
          updatedAt: sql`now()`,
        },
      });
  }

  const accounts = [
    {
      email: 'test-admin@example.test',
      name: 'Test Admin',
      kind: 'staff',
      roles: ['administrator'],
    },
    {
      email: 'test-agent@example.test',
      name: 'Test Agent',
      kind: 'staff',
      roles: ['rental_agent'],
    },
    {
      email: 'test-finance@example.test',
      name: 'Test Finance',
      kind: 'staff',
      roles: ['finance_staff'],
    },
    { email: 'test-customer@example.test', name: 'Test Customer', kind: 'customer', roles: [] },
  ];

  for (const a of accounts) {
    const [acc] = await db
      .insert(account)
      .values({
        kind: a.kind,
        email: a.email,
        emailNormalized: a.email,
        emailVerifiedAt: sql`now()`,
        passwordHash,
        status: 'active',
        displayName: a.name,
        localeCode: 'en',
      })
      .onConflictDoUpdate({
        target: account.emailNormalized,
        set: { status: 'active', updatedAt: sql`now()` },
      })
      .returning();
    if (acc && a.kind === 'staff') {
      await db
        .insert(staffProfile)
        .values({
          accountId: acc.id,
          organizationId: org.id,
          roleCodes: a.roles,
          locationScope: [],
          approvalLimitMinor: a.roles.includes('administrator') ? 1_000_000 : 50_000,
          status: 'active',
          activatedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: staffProfile.accountId,
          set: { roleCodes: a.roles, status: 'active', updatedAt: sql`now()` },
        });
    }
  }

  await seedDiscovery(db, org.id, { locationCodes: ['TST1', 'TST2'] });
}
