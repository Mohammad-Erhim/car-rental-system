import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

/**
 * DAT-CONFIG-VERSION (SRS §9.2, FR-ADM-005..007). Append-only versioned configuration for a
 * `kind` (policy | pricing | product | location). Publishing creates a new version and
 * supersedes the previous — a prior accepted version is never edited. The author cannot approve
 * their own draft unless they also hold the approver permission.
 */
export const configVersion = pgTable(
  'config_version',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    kind: text('kind').notNull(),
    key: text('key').notNull(), // e.g. 'cancellation', 'fuel_rate', a rate-plan id
    /** the config's own monotonic revision for (kind,key) — distinct from the row's optimistic `version` */
    revision: integer('revision').notNull().default(1),
    state: text('state').notNull().default('draft'), // draft | in_review | published | superseded | rejected
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    note: text('note'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'string' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    submittedBy: uuid('submitted_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }),
    approvedBy: uuid('approved_by'),
  },
  (t) => ({
    kindKeyRev: uniqueIndex('config_version_kind_key_rev_unq').on(t.kind, t.key, t.revision),
    currentIdx: index('config_version_current_idx').on(t.organizationId, t.kind, t.key, t.state),
    // at most one live revision per setting — guards concurrent approvals of two drafts
    onePublished: uniqueIndex('config_version_one_published_unq')
      .on(t.kind, t.key)
      .where(sql`${t.state} = 'published'`),
  }),
);

/**
 * DAT-REPORT-DEFINITION (SRS §9.2, FR-RPT-001). A whitelisted, parameterised report. The
 * `queryKind` maps to a hard-coded aggregate in `report.service` — no free SQL.
 */
export const reportDefinition = pgTable(
  'report_definition',
  {
    ...auditColumns,
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    queryKind: text('query_kind').notNull(), // reservations_by_state | revenue_by_category | fleet_utilisation | refunds | open_cases
    paramSchema: jsonb('param_schema')
      .$type<Array<{ name: string; type: 'date' | 'string'; required?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    columns: jsonb('columns')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    minPermission: text('min_permission').notNull().default('report.read'),
  },
  (t) => ({ codeUnq: uniqueIndex('report_definition_code_unq').on(t.code) }),
);

export const reportRun = pgTable(
  'report_run',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    definitionCode: text('definition_code').notNull(),
    params: jsonb('params')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('complete'), // running | complete | failed
    rowCount: integer('row_count').notNull().default(0),
    /** the computed rows (small reports) — large exports would stream instead */
    result: jsonb('result')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    scopeNote: text('scope_note'),
    /** the location codes the run's query was actually confined to (FR-RPT-004); `[]` = org-wide.
     *  Machine-checkable twin of `scopeNote` — read access is enforced against this, never by
     *  parsing the human-readable note. */
    locationScope: jsonb('location_scope')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => ({
    defIdx: index('report_run_def_idx').on(t.organizationId, t.definitionCode, t.createdAt),
  }),
);

export const reportSchedule = pgTable(
  'report_schedule',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    definitionCode: text('definition_code').notNull(),
    cron: text('cron').notNull(),
    params: jsonb('params')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recipients: jsonb('recipients')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: text('is_active').notNull().default('true'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'string' }),
    lastSkipReason: text('last_skip_reason'),
  },
  (t) => ({ orgIdx: index('report_schedule_org_idx').on(t.organizationId, t.definitionCode) }),
);

/**
 * DAT-DATA-QUALITY-FINDING (FR-RPT-006). One row per data-quality check id — the granularity the
 * checks themselves already work at (an aggregate count + sample, not per offending record).
 * Tracks the case-management state a live check result alone can't: who owns it, when it was
 * first/last seen non-zero, and the evidence for why it was closed. Reconciled on every
 * `dataQuality()` run (manual re-check or the scheduled sweep alike) — see
 * `ReportService.reconcileFindings` for the state machine and why a resolved finding survives an
 * identical recurrence but reopens on a materially different one.
 */
export const dataQualityFinding = pgTable(
  'data_quality_finding',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    checkId: text('check_id').notNull(),
    title: text('title').notNull(),
    severity: text('severity').notNull(), // high | medium | low
    state: text('state').notNull().default('open'), // open | acknowledged | resolved | false_positive
    count: integer('count').notNull().default(0),
    /** hash of the sorted sample set — how a resolved/false_positive finding tells "the exact
     *  same violation, still not fixed" (stays suppressed) from "a different one just showed up
     *  under the same check id" (reopens). */
    sampleHash: text('sample_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'string' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).notNull(),
    ownerId: uuid('owner_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    resolvedBy: uuid('resolved_by'),
    resolutionNote: text('resolution_note'),
  },
  (t) => ({
    checkUnq: uniqueIndex('data_quality_finding_check_unq').on(t.organizationId, t.checkId),
    stateIdx: index('data_quality_finding_state_idx').on(t.organizationId, t.state),
  }),
);
