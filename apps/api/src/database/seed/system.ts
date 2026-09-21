import { LOCALES, DEFAULT_LOCALE, NAMESPACED_RESOURCES } from '@carrental/i18n';
import { sql } from 'drizzle-orm';

import { revOf } from '../../common/i18n-source-rev';
import type { Database } from '../drizzle';
import { reportDefinition } from '../schema/admin';
import { locale, translation } from '../schema/i18n';
import { permissionAction, role } from '../schema/iam';
import { lookupType, lookupValue } from '../schema/lookup';

import { MOBILE_TRANSLATIONS } from './mobile-i18n';

/**
 * SYSTEM seed — required catalogues + system-fixed invariants only (SRS-DAT-011).
 * No people, vehicles, bookings, or money. Idempotent (safe to re-run).
 */

const SYSTEM_FIXED_STATE_SETS: Record<string, string[]> = {
  // SRS §6.6 lifecycle tables — served read-only from these rows (SRS-LKP-005/012)
  reservation_state: [
    'draft_checkout',
    'pending_prerequisite',
    'confirmed',
    'modified_confirmed',
    'pickup_ready',
    'rental_opened',
    'cancelled',
    'no_show',
    'expired',
  ],
  rental_state: [
    'opening_pending',
    'active',
    'active_extended',
    'incident_review',
    'replacement_in_progress',
    'overdue',
    'return_started',
    'returned_pending_inspection',
    'financial_review',
    'completed',
    'terminated_review',
  ],
  vehicle_state: [
    'draft',
    'available',
    'held_assigned',
    'pickup_ready',
    'on_rent',
    'returned_pending_inspection',
    'cleaning',
    'maintenance',
    'damage_review',
    'transfer',
    'unavailable',
    'retired',
  ],
  payment_state: [
    'created',
    'action_required',
    'processing',
    'authorized',
    'captured',
    'partially_captured',
    'failed',
    'cancelled',
    'expired',
    'unknown',
  ],
  refund_state: ['requested', 'processing', 'succeeded', 'failed', 'cancelled', 'manual_review'],
  security_hold_state: [
    'required',
    'pending',
    'authorized',
    'adjusted',
    'partially_captured',
    'released',
    'expired',
    'failed',
  ],
  incident_state: ['reported', 'triaged', 'active_response', 'investigation', 'resolved', 'closed'],
  maintenance_state: ['draft', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled'],
  inspection_state: ['due', 'in_progress', 'passed', 'failed', 'needs_review', 'superseded'],
  readiness_outcome: ['ready', 'not_ready', 'needs_review'],
  reconciliation_state: [
    'open',
    'investigating',
    'resolved_linked',
    'resolved_compensated',
    'resolved_explained',
    'escalated',
  ],
  notification_event: [
    'reservation_confirmed',
    'reservation_modified',
    'reservation_cancelled',
    'payment_receipt',
    'refund_status',
    'pickup_reminder',
    'return_reminder',
    'extension_decision',
    'incident_update',
    'account_verification',
    'account_recovery',
    'security_alert',
  ],
  delivery_state: ['queued', 'sent', 'delivered', 'failed', 'suppressed', 'retried'],
};

const CONFIGURABLE_LOOKUPS: Record<string, { label: string; values: [string, string][] }> = {
  cancel_reason: {
    label: 'Cancellation reason',
    values: [
      ['customer_request', "At the customer's request"],
      ['plans_changed', 'Plans changed'],
      ['found_better_price', 'Found a better price'],
      ['trip_cancelled', 'Trip cancelled'],
      ['booked_by_mistake', 'Booked by mistake'],
      ['no_show', 'No-show'],
      ['payment_failed', 'Payment failed'],
      ['duplicate', 'Duplicate booking'],
      ['goodwill', 'Goodwill / service recovery'],
      ['other', 'Other'],
    ],
  },
  no_show_reason: {
    label: 'No-show reason',
    values: [
      ['customer_did_not_arrive', 'Customer did not arrive'],
      ['grace_period_elapsed', 'Grace period elapsed'],
      ['contact_failed', 'Could not reach customer'],
    ],
  },
  override_reason: {
    label: 'Override reason',
    values: [
      ['manager_goodwill', 'Manager goodwill'],
      ['service_recovery', 'Service recovery'],
      ['pricing_error_correction', 'Pricing error correction'],
      ['documented_exception', 'Documented business exception'],
    ],
  },
  refund_reason: {
    label: 'Refund reason',
    values: [
      ['policy_cancellation', 'Policy cancellation'],
      ['service_failure', 'Service failure'],
      ['overcharge_correction', 'Overcharge correction'],
      ['goodwill', 'Goodwill'],
    ],
  },
  adjustment_reason: {
    label: 'Adjustment reason',
    values: [
      ['excess_distance', 'Excess distance'],
      ['fuel_difference', 'Fuel / charge difference'],
      ['late_return', 'Late return'],
      ['cleaning', 'Cleaning'],
      ['damage', 'Damage'],
      ['toll', 'Toll'],
      ['fine', 'Traffic fine'],
      ['one_way_change', 'One-way change'],
      ['goodwill_credit', 'Goodwill credit'],
    ],
  },
  transfer_reason: {
    label: 'Transfer reason',
    values: [
      ['demand_balancing', 'Demand balancing'],
      ['one_way_return', 'One-way return repositioning'],
      ['maintenance_facility', 'Move to maintenance facility'],
    ],
  },
  block_reason: {
    label: 'Availability block reason',
    values: [
      ['maintenance', 'Maintenance'],
      ['damage', 'Damage'],
      ['internal_use', 'Internal use'],
      ['operational_buffer', 'Operational buffer'],
      ['regulatory', 'Regulatory restriction'],
    ],
  },
  case_reason: {
    label: 'Service case reason',
    values: [
      ['billing_question', 'Billing question'],
      ['charge_dispute', 'Charge dispute'],
      ['lost_property', 'Lost property'],
      ['complaint', 'Complaint'],
      ['data_request', 'Data request'],
    ],
  },
  restriction_reason: {
    label: 'Customer restriction reason',
    values: [
      ['unpaid_balance', 'Unpaid balance'],
      ['chargeback', 'Payment chargeback'],
      ['fraud_indicators', 'Suspected fraud'],
      ['licence_issue', 'Licence / ID problem'],
      ['damage_history', 'Prior damage or recovery'],
      ['behavioural', 'Conduct or safety concern'],
      ['complaint', 'Complaint or dispute'],
      ['document_expired', 'Expired required document'],
      ['other', 'Other (see evidence)'],
    ],
  },
  incident_type: {
    label: 'Incident type',
    values: [
      ['collision', 'Collision'],
      ['theft', 'Theft'],
      ['vandalism', 'Vandalism'],
      ['glass_damage', 'Glass damage'],
      ['tyre', 'Tyre / wheel'],
      ['mechanical_breakdown', 'Mechanical breakdown'],
      ['other', 'Other'],
    ],
  },
  damage_finding: {
    label: 'Damage finding',
    values: [
      ['scratch', 'Scratch'],
      ['dent', 'Dent'],
      ['chip', 'Chip'],
      ['interior_stain', 'Interior stain'],
      ['missing_part', 'Missing part'],
      ['mechanical', 'Mechanical fault'],
    ],
  },
  cleaning_maint_type: {
    label: 'Cleaning / maintenance type',
    values: [
      ['standard_clean', 'Standard clean'],
      ['deep_clean', 'Deep clean'],
      ['scheduled_service', 'Scheduled service'],
      ['tyre_change', 'Tyre change'],
      ['repair', 'Repair'],
      ['recall', 'Manufacturer recall'],
    ],
  },
  document_type: {
    label: 'Document type',
    values: [
      ['driver_licence', 'Driver licence'],
      ['passport', 'Passport'],
      ['id_card', 'National ID card'],
      ['proof_of_address', 'Proof of address'],
      ['vehicle_registration', 'Vehicle registration'],
      ['insurance_certificate', 'Insurance certificate'],
    ],
  },
  vehicle_feature: {
    label: 'Vehicle feature',
    values: [
      ['air_conditioning', 'Air conditioning'],
      ['bluetooth', 'Bluetooth'],
      ['apple_carplay', 'Apple CarPlay'],
      ['android_auto', 'Android Auto'],
      ['parking_sensors', 'Parking sensors'],
      ['reversing_camera', 'Reversing camera'],
      ['cruise_control', 'Cruise control'],
      ['heated_seats', 'Heated seats'],
      ['roof_rails', 'Roof rails'],
      ['tow_bar', 'Tow bar'],
      ['wheelchair_access', 'Wheelchair access'],
    ],
  },
  charge_type: {
    label: 'Charge type',
    values: [
      ['base_rate', 'Base rental'],
      ['vat', 'VAT / sales tax'],
      ['airport_fee', 'Airport concession fee'],
      ['young_driver_fee', 'Young driver fee'],
      ['additional_driver_fee', 'Additional driver fee'],
      ['one_way_fee', 'One-way fee'],
      ['late_return_fee', 'Late return fee'],
      ['security_deposit', 'Security deposit'],
      ['excess_mileage', 'Excess mileage'],
      ['refuelling', 'Refuelling'],
    ],
  },
  discount_type: {
    label: 'Discount type',
    values: [
      ['promo_code', 'Promotion code'],
      ['length_of_rental', 'Length-of-rental discount'],
      ['segment', 'Customer segment discount'],
      ['seasonal', 'Seasonal offer'],
    ],
  },
  licence_type: {
    label: 'Licence type',
    values: [
      ['car_b', 'Car (category B)'],
      ['car_automatic', 'Car — automatic only'],
      ['van_c1', 'Small van (C1)'],
      ['motorcycle_a', 'Motorcycle (A)'],
    ],
  },
};

const EXTERNAL_STANDARDS: Record<string, { label: string; values: [string, string][] }> = {
  country: {
    label: 'Country',
    values: [
      ['US', 'United States'],
      ['GB', 'United Kingdom'],
      ['FR', 'France'],
      ['DE', 'Germany'],
      ['AE', 'United Arab Emirates'],
      ['CA', 'Canada'],
    ],
  },
  currency: {
    label: 'Currency',
    values: [
      ['USD', 'US Dollar'],
      ['GBP', 'Pound Sterling'],
      ['EUR', 'Euro'],
      ['AED', 'UAE Dirham'],
      ['CAD', 'Canadian Dollar'],
    ],
  },
  time_zone: {
    label: 'Time zone',
    values: [
      ['America/New_York', 'America/New_York'],
      ['America/Los_Angeles', 'America/Los_Angeles'],
      ['Europe/London', 'Europe/London'],
      ['Europe/Paris', 'Europe/Paris'],
      ['Asia/Dubai', 'Asia/Dubai'],
    ],
  },
  payment_method: {
    label: 'Payment method',
    values: [
      ['visa', 'Visa'],
      ['mastercard', 'Mastercard'],
      ['amex', 'American Express'],
      ['sim_card', 'Test card (simulator)'],
    ],
  },
};

const PERMISSION_ACTIONS: Array<[string, string, string, string]> = [
  ['catalogue.read', 'catalogue', 'normal', 'View catalogue, locations, availability'],
  ['catalogue.manage', 'catalogue', 'elevated', 'Manage vehicle categories, features, rate plans'],
  ['reservation.read', 'reservation', 'normal', 'View reservations'],
  ['reservation.create', 'reservation', 'normal', 'Create reservations (assisted booking)'],
  ['reservation.modify', 'reservation', 'normal', 'Modify reservations'],
  ['reservation.cancel', 'reservation', 'elevated', 'Cancel reservations'],
  ['rental.read', 'rental', 'normal', 'View rentals'],
  ['rental.pickup', 'rental', 'normal', 'Run pickup / open rentals'],
  ['rental.return', 'rental', 'normal', 'Receive returns / close rentals'],
  ['payment.read', 'payment', 'normal', 'View payments and receipts'],
  ['payment.refund', 'payment', 'high', 'Issue refunds'],
  ['payment.reconcile', 'payment', 'elevated', 'Resolve reconciliation exceptions'],
  ['fleet.read', 'fleet', 'normal', 'View fleet'],
  ['fleet.manage', 'fleet', 'elevated', 'Manage vehicles, transfers, maintenance, blocks'],
  ['customer.read', 'customer', 'normal', 'View customer records'],
  ['customer.manage', 'customer', 'elevated', 'Edit customer data, restrictions, merges'],
  ['config.read', 'config', 'normal', 'View configuration'],
  ['config.publish', 'config', 'high', 'Publish pricing / policy / product / template versions'],
  ['lookup.manage', 'config', 'elevated', 'Manage reference data values'],
  ['staff.manage', 'admin', 'high', 'Manage staff accounts, roles, scopes'],
  [
    'workflow.manage',
    'admin',
    'high',
    'Create, edit and publish approval workflows and choose which action each one governs',
  ],
  [
    'workflow.monitor',
    'admin',
    'elevated',
    'See every approval request, reassign a task, cancel or force a request through (audited)',
  ],
  ['report.read', 'report', 'normal', 'View reports'],
  ['report.export', 'report', 'elevated', 'Export / schedule reports'],
  ['audit.read', 'audit', 'elevated', 'View audit and data-quality'],
  [
    'audit.manage',
    'audit',
    'high',
    'Acknowledge / resolve data-quality findings — kept separate from audit.read (SRS-SEC-007: a read permission must never itself unlock a write)',
  ],
  ['integration.manage', 'admin', 'high', 'Manage integration health / recovery'],
  [
    'payment.manage',
    'admin',
    'high',
    'Configure the payment provider (Stripe keys, live/test switch) — deliberately excluded from every other role\'s "all permissions" grant; only `administrator` holds it. Whoever can change where the money goes is a narrower list than whoever can do everything else.',
  ],
  [
    'email.manage',
    'admin',
    'high',
    'Configure the email provider (SMTP host/credentials, outbox/live switch) — deliberately excluded from every other role\'s "all permissions" grant; only `administrator` holds it.',
  ],
];

/** Permissions this narrow even the org's own 'ALL'-permission roles don't all get by default —
 *  only the roles explicitly listed here: the payment provider switch and the email provider
 *  switch. Every other admin action bundles into `manager`/`administrator`'s 'ALL' grant, but
 *  "who can point this system at a different Stripe account / mail server" is deliberately a
 *  strictly smaller list. */
const ADMIN_ONLY_ACTIONS: Record<string, string[]> = {
  'payment.manage': ['administrator'],
  'email.manage': ['administrator'],
  'workflow.manage': ['administrator'],
};

/** `ALL` = every action except the admin-only ones; `WILDCARD` = the `*` grant (everything, always). */
const SYSTEM_ROLES: Array<{ code: string; name: string; actions: string[] | 'ALL' | 'WILDCARD' }> =
  [
    {
      code: 'rental_agent',
      name: 'Rental agent',
      actions: [
        'catalogue.read',
        'reservation.read',
        'reservation.create',
        'reservation.modify',
        'reservation.cancel',
        'rental.read',
        'rental.pickup',
        'rental.return',
        'payment.read',
        'customer.read',
        'fleet.read',
      ],
    },
    {
      code: 'fleet_staff',
      name: 'Fleet staff',
      actions: [
        'catalogue.read',
        'catalogue.manage',
        'fleet.read',
        'fleet.manage',
        'rental.read',
        'report.read',
      ],
    },
    {
      code: 'finance_staff',
      name: 'Finance staff',
      actions: [
        'payment.read',
        'payment.refund',
        'payment.reconcile',
        'reservation.read',
        'rental.read',
        'report.read',
        'report.export',
      ],
    },
    {
      code: 'support_staff',
      name: 'Support staff',
      actions: [
        'catalogue.read',
        'reservation.read',
        'reservation.modify',
        'rental.read',
        'customer.read',
        'payment.read',
      ],
    },
    { code: 'manager', name: 'Location manager', actions: 'ALL' },
    { code: 'administrator', name: 'System administrator', actions: 'WILDCARD' },
    {
      code: 'auditor',
      name: 'Auditor',
      actions: [
        'reservation.read',
        'rental.read',
        'payment.read',
        'fleet.read',
        'report.read',
        'audit.read',
      ],
    },
  ];

export async function seedSystem(db: Database): Promise<void> {
  // --- locales ---
  for (const [i, def] of Object.values(LOCALES).entries()) {
    await db
      .insert(locale)
      .values({
        code: def.code,
        nativeName: def.nativeName,
        englishName: def.englishName,
        direction: def.direction,
        fallbackChain: def.fallback,
        isDefault: def.code === DEFAULT_LOCALE,
        isActive: true,
        testOnly: def.testOnly,
        sortOrder: i,
      })
      .onConflictDoUpdate({
        target: locale.code,
        set: {
          nativeName: def.nativeName,
          englishName: def.englishName,
          direction: def.direction,
          fallbackChain: def.fallback,
          isDefault: def.code === DEFAULT_LOCALE,
          testOnly: def.testOnly,
          updatedAt: sql`now()`,
        },
      });
  }

  // --- base UI translations (from @carrental/i18n static bundles, plus mobile-only strings that
  // have no static bundle anywhere — see mobile-i18n.ts) ---
  // Every bundled string is seeded as already published: `value` and `publishedValue` both set, and
  // `sourceRevision` stamped with the hash of the *English* source so the Translations screen shows
  // the catalogue as up to date (not a wall of "outdated" badges) straight after a seed.
  const enBundle = NAMESPACED_RESOURCES.en ?? {};
  const enMobile = MOBILE_TRANSLATIONS.en ?? {};
  const seededLocales = new Set([
    ...Object.keys(NAMESPACED_RESOURCES),
    ...Object.keys(MOBILE_TRANSLATIONS),
  ]);
  const seededNamespaces: Record<string, Record<string, Record<string, string>>> = {};
  for (const loc of seededLocales) {
    seededNamespaces[loc] = {
      ...(NAMESPACED_RESOURCES[loc] ?? {}),
      mobile: MOBILE_TRANSLATIONS[loc] ?? {},
    };
  }
  for (const [loc, namespaces] of Object.entries(seededNamespaces)) {
    for (const [ns, entries] of Object.entries(namespaces)) {
      for (const [key, value] of Object.entries(entries)) {
        const rev = revOf(
          ns === 'mobile'
            ? (enMobile[key] ?? value)
            : ((enBundle as Record<string, Record<string, string>>)[ns]?.[key] ?? value),
        );
        await db
          .insert(translation)
          .values({
            namespace: ns,
            key,
            localeCode: loc,
            value,
            publishedValue: value,
            status: 'published',
            sourceRevision: rev,
          })
          .onConflictDoUpdate({
            target: [translation.namespace, translation.key, translation.localeCode],
            set: {
              value,
              publishedValue: value,
              status: 'published',
              sourceRevision: rev,
              updatedAt: sql`now()`,
            },
          });
      }
    }
  }

  // --- permission actions (system-fixed) ---
  for (const [code, group, riskLevel, description] of PERMISSION_ACTIONS) {
    await db
      .insert(permissionAction)
      .values({ code, group, riskLevel, description })
      .onConflictDoUpdate({
        target: permissionAction.code,
        set: { group, riskLevel, description, updatedAt: sql`now()` },
      });
  }

  // --- system roles ---
  const allActionCodes = PERMISSION_ACTIONS.map(([c]) => c);
  for (const r of SYSTEM_ROLES) {
    const actions =
      r.actions === 'WILDCARD'
        ? ['*'] // resolved per request: an action added later is covered without a reseed
        : r.actions === 'ALL'
          ? allActionCodes.filter((code) => {
              const allowList = ADMIN_ONLY_ACTIONS[code];
              return !allowList || allowList.includes(r.code);
            })
          : r.actions;
    await db
      .insert(role)
      .values({
        organizationId: null,
        code: r.code,
        name: r.name,
        isSystem: true,
        locked: true,
        permissionActions: actions,
      })
      .onConflictDoUpdate({
        target: [role.organizationId, role.code],
        set: { name: r.name, locked: true, permissionActions: actions, updatedAt: sql`now()` },
      });
  }

  // --- lookup types + values ---
  const registerType = async (
    code: string,
    classification: string,
    ownerModule: string,
    editability: string,
    requiredCodes: string[] = [],
    lockReason?: string,
  ) => {
    await db
      .insert(lookupType)
      .values({
        code,
        classification,
        ownerModule,
        editability,
        requiredCodes,
        lockReason: lockReason ?? null,
        scopeModel: 'global',
      })
      .onConflictDoUpdate({
        target: lookupType.code,
        set: { classification, editability, requiredCodes, updatedAt: sql`now()` },
      });
  };

  const registerValues = async (
    typeCode: string,
    values: [string, string][],
    systemManaged: boolean,
  ) => {
    for (const [i, [code, label]] of values.entries()) {
      await db
        .insert(lookupValue)
        .values({
          typeCode,
          code,
          scopeKey: 'global',
          defaultLabel: label,
          sortOrder: i,
          isActive: true,
          systemManaged,
        })
        .onConflictDoUpdate({
          target: [lookupValue.typeCode, lookupValue.scopeKey, lookupValue.code],
          set: { defaultLabel: label, sortOrder: i, updatedAt: sql`now()` },
        });
    }
  };

  // system-fixed state sets — read-only, integrity-checked
  for (const [typeCode, codes] of Object.entries(SYSTEM_FIXED_STATE_SETS)) {
    await registerType(
      typeCode,
      'system_fixed',
      typeCode.startsWith('notification') || typeCode.startsWith('delivery') ? 'notify' : 'core',
      'read_only',
      codes,
      'Lifecycle / event code set — transitions and meaning are enforced in code (SRS-LKP-005).',
    );
    await registerValues(
      typeCode,
      codes.map((c) => [c, humanize(c)] as [string, string]),
      true,
    );
  }

  // configurable business lookups — editable by authorized users
  for (const [typeCode, spec] of Object.entries(CONFIGURABLE_LOOKUPS)) {
    await registerType(typeCode, 'configurable', 'config', 'editable');
    await registerValues(typeCode, spec.values, false);
  }

  // external / standards references — enable safe subset; codes locked
  for (const [typeCode, spec] of Object.entries(EXTERNAL_STANDARDS)) {
    await registerType(
      typeCode,
      'external',
      'config',
      'constrained',
      [],
      'Standards-managed reference; codes and structure are locked (SRS-LKP-006).',
    );
    await registerValues(typeCode, spec.values, true);
  }

  // permission-action lookup mirror (for the role editor selector)
  await registerType(
    'permission_action',
    'system_fixed',
    'iam',
    'read_only',
    allActionCodes,
    'Security meaning is fixed; only grouping/label localization is permitted (SRS §21.1).',
  );
  await registerValues(
    'permission_action',
    PERMISSION_ACTIONS.map(([c, , , d]) => [c, d] as [string, string]),
    true,
  );

  // --- transactional notification templates (published, en/fr/ar) ---
  await seedTemplates(db);

  // --- report definitions (whitelisted aggregates) ---
  await seedReportDefinitions(db);
}

const REPORT_DEFINITIONS: Array<{
  code: string;
  title: string;
  description: string;
  queryKind: string;
  columns: string[];
  minPermission: string;
}> = [
  // ---- analytic reports: a period, a comparison, KPIs, a trend and breakdowns ----
  {
    code: 'overview',
    title: 'Business overview',
    description:
      'The headline numbers for a period: revenue, bookings, average daily rate, fleet utilisation, cancellations and cash collected.',
    queryKind: 'analytic:overview',
    columns: [],
    minPermission: 'report.read',
  },
  {
    code: 'sales',
    title: 'Sales & revenue',
    description:
      'What was sold: revenue without tax, bookings, average rate per day, extras, tax and lost value, by vehicle category, branch and channel.',
    queryKind: 'analytic:sales',
    columns: [],
    minPermission: 'report.read',
  },
  {
    code: 'bookings',
    title: 'Bookings',
    description:
      'How demand turned into trips: conversion, cancellations and no-shows, lead time, trip length and reasons.',
    queryKind: 'analytic:bookings',
    columns: [],
    minPermission: 'report.read',
  },
  {
    code: 'fleet',
    title: 'Fleet utilisation',
    description:
      'How much of the fleet earned money: utilisation, rented and blocked days, revenue per rented and per available day, vehicle by vehicle.',
    queryKind: 'analytic:fleet',
    columns: [],
    minPermission: 'report.read',
  },
  {
    code: 'payments',
    title: 'Payments & refunds',
    description:
      'Money that moved: collected, refunded and net by day, purpose and method, failed attempts, tax invoiced and unpaid balances.',
    queryKind: 'analytic:payments',
    columns: [],
    minPermission: 'report.read',
  },
  {
    code: 'operations',
    title: 'Operations',
    description:
      'The work at the counter: pick-ups and returns, late returns, extensions, no-shows, inspection findings and damage charges.',
    queryKind: 'analytic:operations',
    columns: [],
    minPermission: 'report.read',
  },
  // ---- earlier single-table reports: still run (and existing schedules keep working) ----
  {
    code: 'reservations_by_state',
    title: 'Reservations by state',
    description: 'Count and value of reservations grouped by their current state.',
    queryKind: 'reservations_by_state',
    columns: ['state', 'currency', 'count', 'totalMinor'],
    minPermission: 'report.read',
  },
  {
    code: 'revenue_by_category',
    title: 'Revenue by vehicle category',
    description: 'Confirmed + fulfilled reservation revenue per category.',
    queryKind: 'revenue_by_category',
    columns: ['categoryCode', 'currency', 'reservations', 'revenueMinor'],
    minPermission: 'report.read',
  },
  {
    code: 'fleet_utilisation',
    title: 'Fleet utilisation',
    description: 'Vehicle units grouped by their current state.',
    queryKind: 'fleet_utilisation',
    columns: ['state', 'units'],
    minPermission: 'report.read',
  },
  {
    code: 'refunds',
    title: 'Refunds summary',
    description:
      'Total refunded amount per currency and the number of payments that were refunded.',
    queryKind: 'refunds',
    columns: ['currency', 'refundedMinor', 'intents'],
    minPermission: 'report.read',
  },
  {
    code: 'open_cases',
    title: 'Open recovery cases & reconciliation exceptions',
    description: 'Owned items still needing resolution.',
    queryKind: 'open_cases',
    columns: ['kind', 'open'],
    minPermission: 'audit.read',
  },
  {
    code: 'data_quality_sweep',
    title: 'Data quality sweep',
    description:
      'The referential-integrity / drift checks from the Data quality page (FR-RPT-006) — ' +
      'schedule this like any other report to get an automatic recurring run with email ' +
      'delivery, instead of relying on someone remembering to open the page.',
    queryKind: 'data_quality_sweep',
    columns: ['id', 'title', 'severity', 'count', 'state', 'sample', 'error'],
    minPermission: 'audit.read',
  },
];

async function seedReportDefinitions(db: Database): Promise<void> {
  for (const d of REPORT_DEFINITIONS) {
    await db
      .insert(reportDefinition)
      .values({
        code: d.code,
        title: d.title,
        description: d.description,
        queryKind: d.queryKind,
        columns: d.columns,
        minPermission: d.minPermission,
      })
      .onConflictDoUpdate({
        target: reportDefinition.code,
        set: {
          title: d.title,
          description: d.description,
          columns: d.columns,
          updatedAt: sql`now()`,
        },
      });
  }
}

const TEMPLATES: Array<{
  key: string;
  variables: Array<{ name: string; required?: boolean; legal?: boolean }>;
  byLocale: Record<string, { subject: string; body: string }>;
}> = [
  {
    key: 'account_verification',
    variables: [{ name: 'code', required: true }, { name: 'name' }],
    byLocale: {
      en: {
        subject: 'Your verification code: {{code}}',
        body: 'Hi {{name}},\n\nYour verification code is {{code}}. It expires in 15 minutes.\n\nIf you did not request this, you can ignore this message.',
      },
      fr: {
        subject: 'Votre code de vérification : {{code}}',
        body: 'Bonjour {{name}},\n\nVotre code de vérification est {{code}}. Il expire dans 15 minutes.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      },
      ar: {
        subject: 'رمز التحقق الخاص بك: {{code}}',
        body: 'مرحبًا {{name}}،\n\nرمز التحقق الخاص بك هو {{code}}. تنتهي صلاحيته خلال 15 دقيقة.\n\nإذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.',
      },
    },
  },
  {
    key: 'reservation_confirmed',
    variables: [
      { name: 'reference', required: true },
      { name: 'total', required: true },
    ],
    byLocale: {
      en: {
        subject: 'Your booking {{reference}} is confirmed',
        body: 'Your booking {{reference}} is confirmed.\n\nTotal charged: {{total}}.\n\nYou can view or manage it any time from your account.',
      },
      fr: {
        subject: 'Votre réservation {{reference}} est confirmée',
        body: 'Votre réservation {{reference}} est confirmée.\n\nMontant débité : {{total}}.\n\nVous pouvez la consulter ou la gérer à tout moment depuis votre compte.',
      },
      ar: {
        subject: 'تم تأكيد حجزك {{reference}}',
        body: 'تم تأكيد حجزك {{reference}}.\n\nالمبلغ المدفوع: {{total}}.\n\nيمكنك عرضه أو إدارته في أي وقت من حسابك.',
      },
    },
  },
  {
    key: 'reservation_cancelled',
    variables: [{ name: 'reference', required: true }, { name: 'refund' }],
    byLocale: {
      en: {
        subject: 'Your booking {{reference}} was cancelled',
        body: 'Your booking {{reference}} has been cancelled.\n\nRefund: {{refund}}.\n\nIf you did not request this cancellation, contact support.',
      },
      fr: {
        subject: 'Votre réservation {{reference}} a été annulée',
        body: 'Votre réservation {{reference}} a été annulée.\n\nRemboursement : {{refund}}.\n\nSi vous n’êtes pas à l’origine de cette annulation, contactez le support.',
      },
      ar: {
        subject: 'تم إلغاء حجزك {{reference}}',
        body: 'تم إلغاء حجزك {{reference}}.\n\nالمبلغ المسترد: {{refund}}.\n\nإذا لم تطلب هذا الإلغاء، فتواصل مع الدعم.',
      },
    },
  },
  {
    key: 'account_recovery',
    variables: [{ name: 'code', required: true }, { name: 'name' }],
    byLocale: {
      en: {
        subject: 'Reset your password — code {{code}}',
        body: 'Hi {{name}},\n\nUse code {{code}} to reset your password. It expires in 15 minutes and can be used once.\n\nIf you did not request a reset, your account is still secure — no action is needed.',
      },
      fr: {
        subject: 'Réinitialisez votre mot de passe — code {{code}}',
        body: 'Bonjour {{name}},\n\nUtilisez le code {{code}} pour réinitialiser votre mot de passe. Il expire dans 15 minutes et est à usage unique.\n\nSi vous n’avez pas fait cette demande, votre compte reste sécurisé.',
      },
      ar: {
        subject: 'إعادة تعيين كلمة المرور — الرمز {{code}}',
        body: 'مرحبًا {{name}}،\n\nاستخدم الرمز {{code}} لإعادة تعيين كلمة المرور. تنتهي صلاحيته خلال 15 دقيقة ويُستخدم مرة واحدة.\n\nإذا لم تطلب ذلك، فحسابك آمن ولا حاجة لأي إجراء.',
      },
    },
  },
  {
    key: 'security_alert',
    variables: [{ name: 'event' }, { name: 'name' }],
    byLocale: {
      en: {
        subject: 'Security update on your account',
        body: 'Hi {{name}},\n\nA security-relevant change was made to your account ({{event}}). If this was you, no action is needed. If not, reset your password and contact support.',
      },
      fr: {
        subject: 'Mise à jour de sécurité sur votre compte',
        body: 'Bonjour {{name}},\n\nUn changement lié à la sécurité a été effectué sur votre compte ({{event}}). Si c’était vous, aucune action n’est requise. Sinon, réinitialisez votre mot de passe et contactez le support.',
      },
      ar: {
        subject: 'تحديث أمني على حسابك',
        body: 'مرحبًا {{name}}،\n\nتم إجراء تغيير متعلق بالأمان على حسابك ({{event}}). إذا كنت أنت، فلا حاجة لأي إجراء. وإلا، أعد تعيين كلمة المرور وتواصل مع الدعم.',
      },
    },
  },
];

async function seedTemplates(db: Database): Promise<void> {
  const { template } = await import('../schema/notify');
  for (const t of TEMPLATES) {
    for (const [loc, content] of Object.entries(t.byLocale)) {
      await db
        .insert(template)
        .values({
          key: t.key,
          channel: 'email',
          localeCode: loc,
          version: '1.0',
          subject: content.subject,
          bodyTemplate: content.body,
          variables: t.variables,
          status: 'published',
          publishedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [template.key, template.channel, template.localeCode, template.version],
          set: {
            subject: content.subject,
            bodyTemplate: content.body,
            status: 'published',
            updatedAt: sql`now()`,
          },
        });
    }
  }
}

function humanize(code: string): string {
  return code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/, 'ID');
}
