import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';

import type { Database } from '../drizzle';
import { customer } from '../schema/customer';
import { account, role, staffProfile } from '../schema/iam';
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

  // test-only custom role: exactly `config.read`, no `config.publish` — proves a plain
  // config-viewer (the kind an org can create via the role editor) can't write through an
  // endpoint that only meant to let it view (e.g. notification-template drafting).
  await db
    .insert(role)
    .values({
      organizationId: org.id,
      code: 'config_viewer',
      name: 'Config viewer (test)',
      isSystem: false,
      permissionActions: ['config.read'],
    })
    .onConflictDoUpdate({
      target: [role.organizationId, role.code],
      set: { permissionActions: ['config.read'], updatedAt: sql`now()` },
    });

  // test-only custom role: exactly `lookup.manage`, no `config.publish` — the kind of narrow
  // "reference-data editor" role an org would create via the role editor. Proves it can draft a
  // lookup:* label translation but neither touch an unrelated namespace nor publish directly.
  await db
    .insert(role)
    .values({
      organizationId: org.id,
      code: 'lookup_manager',
      name: 'Lookup manager (test)',
      isSystem: false,
      permissionActions: ['lookup.manage'],
    })
    .onConflictDoUpdate({
      target: [role.organizationId, role.code],
      set: { permissionActions: ['lookup.manage'], updatedAt: sql`now()` },
    });

  const accounts: Array<{
    email: string;
    name: string;
    kind: string;
    roles: string[];
    locationScope?: string[];
  }> = [
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
    {
      // second config publisher — approval separation of duties (FR-ADM-006)
      email: 'test-manager@example.test',
      name: 'Test Manager',
      kind: 'staff',
      roles: ['manager'],
    },
    {
      // finance staff confined to TST1 — proves report location-scoping (FR-RPT-004)
      email: 'test-scoped@example.test',
      name: 'Test Scoped Finance',
      kind: 'staff',
      roles: ['finance_staff'],
      locationScope: ['TST1'],
    },
    {
      // fleet staff confined to TST1 — proves fleet block/transfer/import scoping (FR-RPT-004)
      email: 'test-fleet-scoped@example.test',
      name: 'Test Scoped Fleet',
      kind: 'staff',
      roles: ['fleet_staff'],
      locationScope: ['TST1'],
    },
    {
      // config.read only, no config.publish — proves view permission never grants write
      email: 'test-config-viewer@example.test',
      name: 'Test Config Viewer',
      kind: 'staff',
      roles: ['config_viewer'],
    },
    {
      // lookup.manage only, no config.publish — proves it can't reach outside lookup:* or publish
      email: 'test-lookup-manager@example.test',
      name: 'Test Lookup Manager',
      kind: 'staff',
      roles: ['lookup_manager'],
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
          locationScope: a.locationScope ?? [],
          approvalLimitMinor: a.roles.includes('administrator') ? 1_000_000 : 50_000,
          status: 'active',
          activatedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: staffProfile.accountId,
          set: {
            roleCodes: a.roles,
            locationScope: a.locationScope ?? [],
            status: 'active',
            updatedAt: sql`now()`,
          },
        });
    }
    // domain profile for the customer account (register/verify creates this in real use) so the
    // ops customer-record screen (SCREEN-OPS-021/022, FR-ADM-001) has a record to find.
    if (acc && a.kind === 'customer') {
      await db
        .insert(customer)
        .values({
          accountId: acc.id,
          organizationId: org.id,
          fullName: 'Test Customer',
          email: a.email,
          emailNormalized: a.email,
          phone: '+15555550199',
          localeCode: 'en',
          communicationPrefs: { marketingEmail: false },
          consents: [
            { type: 'account_terms', version: '1.0', acceptedAt: new Date().toISOString() },
          ],
          status: 'active',
        })
        .onConflictDoUpdate({
          target: customer.accountId,
          set: { status: 'active', fullName: 'Test Customer', updatedAt: sql`now()` },
        });
    }
  }

  // a second, account-less "Test Customer II" so the duplicate-review + merge flow (FR-ADM-001)
  // has two look-alike records to work with. Distinct name so the SCREEN-OPS-021 record test
  // (which finds the account-backed "Test Customer" by exact name) is unaffected.
  await db
    .insert(customer)
    .values({
      organizationId: org.id,
      fullName: 'Test Customer II',
      email: 'test-customer.dup@example.test',
      emailNormalized: 'test-customer.dup@example.test',
      phone: '+15555550188',
      localeCode: 'en',
      communicationPrefs: {},
      consents: [],
      status: 'active',
    })
    .onConflictDoNothing();

  await seedDiscovery(db, org.id, { locationCodes: ['TST1', 'TST2'] });
}
