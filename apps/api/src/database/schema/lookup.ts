import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-LOOKUP-TYPE (SRS-LKP-002). Metadata for every business-facing option source.
 * `classification` drives editability in the dashboard.
 */
export const lookupType = pgTable(
  'lookup_type',
  {
    ...auditColumns,
    code: text('code').notNull(), // stable type code, e.g. 'cancel_reason'
    classification: text('classification').notNull(),
    // configurable | constrained | system_fixed | external | entity_owned
    ownerModule: text('owner_module').notNull(),
    ownerRole: text('owner_role'),
    scopeModel: text('scope_model').notNull().default('global'), // global|market|location|...
    editability: text('editability').notNull().default('editable'), // editable|constrained|read_only
    lockReason: text('lock_reason'), // shown when read_only/constrained (SRS-LKP-005)
    /** surfaces that read this type — for "where used" (SRS §15.2) */
    consumerSurfaces: jsonb('consumer_surfaces')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cachePolicy: text('cache_policy').notNull().default('etag'),
    /** closed code set this type must always contain (SRS-LKP-012 integrity check) */
    requiredCodes: jsonb('required_codes')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** for external types: last successful sync bookkeeping (SRS-LKP-006) */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'string' }),
    lastSyncStatus: text('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    description: text('description'),
  },
  (t) => ({
    codeUnq: uniqueIndex('lookup_type_code_unq').on(t.code),
    classIdx: index('lookup_type_class_idx').on(t.classification),
  }),
);

/**
 * DAT-LOOKUP-VALUE (SRS-LKP-003). Stable non-localized code + presentation metadata.
 * Referenced values deactivate, never disappear (SRS-LKP-009).
 */
export const lookupValue = pgTable(
  'lookup_value',
  {
    ...auditColumns,
    ...actorColumns,
    typeCode: text('type_code').notNull(),
    code: text('code').notNull(), // stable within (type, scope)
    scopeKey: text('scope_key').notNull().default('global'),
    /** labels/descriptions live in `translation`; this is the source/default label */
    defaultLabel: text('default_label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'string' }),
    effectiveTo: timestamp('effective_to', { withTimezone: true, mode: 'string' }),
    /** constrained attributes permitted for this value (calc family, severity, evidence rule…) */
    attributes: jsonb('attributes')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** true when created by a seed/migration for a system-fixed invariant */
    systemManaged: boolean('system_managed').notNull().default(false),
  },
  (t) => ({
    unq: uniqueIndex('lookup_value_type_scope_code_unq').on(t.typeCode, t.scopeKey, t.code),
    activeIdx: index('lookup_value_active_idx').on(t.typeCode, t.isActive),
  }),
);
