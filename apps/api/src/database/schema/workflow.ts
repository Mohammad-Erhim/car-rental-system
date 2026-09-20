import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';

import { auditColumns, actorColumns } from './_helpers';

/**
 * Workflows (docs/ai-delivery/04-implementation/plan-workflows-roles-permissions.md §2.4, §2.6).
 * A `workflow_definition` is a named pipeline; each edit is an immutable `workflow_definition_version`
 * (a running request pins the version it started on). A `workflow_binding` says which definition
 * governs which action; none = the action is applied directly. Runtime state lives in
 * `workflow_instance` (one per request), `workflow_task` (one per step being worked) and
 * `workflow_task_assignee` (who is asked). `workflow_event` is the append-only history.
 */

export const workflowDefinition = pgTable(
  'workflow_definition',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** built-in starting points (Direct, Two-person review) — cannot be deleted, can be cloned */
    isSystem: boolean('is_system').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({ codeUnq: unique('workflow_definition_org_code_unq').on(t.organizationId, t.code) }),
);

export const workflowDefinitionVersion = pgTable(
  'workflow_definition_version',
  {
    ...auditColumns,
    definitionId: uuid('definition_id').notNull(),
    /** monotonic per definition */
    revision: integer('revision').notNull(),
    status: text('status').notNull().default('draft'), // draft | published | superseded
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
    note: text('note'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    publishedBy: uuid('published_by'),
    createdBy: uuid('created_by'),
  },
  (t) => ({
    revUnq: unique('workflow_definition_version_rev_unq').on(t.definitionId, t.revision),
    // one live version per definition — the one new requests start on
    onePublished: uniqueIndex('workflow_definition_version_one_published_unq')
      .on(t.definitionId)
      .where(sql`${t.status} = 'published'`),
  }),
);

/** Which definition governs which action. Highest `priority` whose `condition` matches wins. */
export const workflowBinding = pgTable(
  'workflow_binding',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id').notNull(),
    actionKey: text('action_key').notNull(),
    definitionId: uuid('definition_id').notNull(),
    /** JSON-logic over the action's declared variables; null = always */
    condition: jsonb('condition').$type<Record<string, unknown> | null>(),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    label: text('label'),
  },
  (t) => ({
    actionIdx: index('workflow_binding_action_idx').on(t.organizationId, t.actionKey, t.active),
  }),
);

export const workflowInstance = pgTable(
  'workflow_instance',
  {
    ...auditColumns,
    organizationId: uuid('organization_id').notNull(),
    actionKey: text('action_key').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    /** what the subject looked like when the request was made — mismatch at apply time ⇒ stale */
    subjectVersion: text('subject_version'),
    subjectLabel: text('subject_label'),
    definitionId: uuid('definition_id').notNull(),
    definitionVersionId: uuid('definition_version_id').notNull(),
    status: text('status').notNull().default('running'),
    /** the captured change, applied by the executor once every step has passed */
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** variables the conditions read (amount, location, …), frozen at request time */
    context: jsonb('context')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    initiatorAccountId: uuid('initiator_account_id').notNull(),
    initiatorStaffId: uuid('initiator_staff_id'),
    initiatorLabel: text('initiator_label'),
    locationCode: text('location_code'),
    /** how many times it has been sent back for changes and restarted */
    revision: integer('revision').notNull().default(1),
    /** interpreter state: parallel-join progress, visited steps */
    state: jsonb('state')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    lastError: text('last_error'),
    applyAttempts: integer('apply_attempts').notNull().default(0),
    nextApplyAt: timestamp('next_apply_at', { withTimezone: true, mode: 'string' }),
    /** the idempotency key of the submit call, so a client retry returns the same instance */
    submitKey: text('submit_key'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    closedReason: text('closed_reason'),
  },
  (t) => ({
    // one OPEN request per (action, subject) — a second request returns the existing one
    oneOpen: uniqueIndex('workflow_instance_one_open_unq')
      .on(t.organizationId, t.actionKey, t.subjectType, t.subjectId)
      .where(sql`${t.status} in ('running','applying','apply_failed')`),
    subjectIdx: index('workflow_instance_subject_idx').on(t.subjectType, t.subjectId),
    statusIdx: index('workflow_instance_status_idx').on(t.organizationId, t.status, t.createdAt),
    initiatorIdx: index('workflow_instance_initiator_idx').on(t.initiatorAccountId, t.createdAt),
    submitKeyUnq: uniqueIndex('workflow_instance_submit_key_unq')
      .on(t.organizationId, t.initiatorAccountId, t.submitKey)
      .where(sql`${t.submitKey} is not null`),
  }),
);

export const workflowTask = pgTable(
  'workflow_task',
  {
    ...auditColumns,
    instanceId: uuid('instance_id').notNull(),
    stepId: text('step_id').notNull(),
    stepType: text('step_type').notNull(), // approval | task | wait
    title: text('title').notNull(),
    /** which parallel branch (`<parallelStepId>:<branchIndex>:<position>`); null for the main route */
    branchRef: text('branch_ref'),
    status: text('status').notNull().default('open'), // open | done | cancelled
    outcome: text('outcome'), // approved | rejected | changes_requested | completed | escalated | timed_out
    mode: text('mode').notNull().default('any'),
    /** decisions needed to settle the step (1 for any, N for quorum, resolved headcount for all) */
    required: integer('required').notNull().default(1),
    excludeInitiator: boolean('exclude_initiator').notNull().default(false),
    requireLocationScope: boolean('require_location_scope').notNull().default(false),
    requireComment: boolean('require_comment').notNull().default(false),
    allowChanges: boolean('allow_changes').notNull().default(true),
    /** the step's actor selectors as they were when the task opened (definition can change later) */
    selectors: jsonb('selectors')
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'string' }),
    remindEveryHours: integer('remind_every_hours'),
    maxReminders: integer('max_reminders').notNull().default(0),
    reminderCount: integer('reminder_count').notNull().default(0),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true, mode: 'string' }),
    onTimeout: text('on_timeout'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true, mode: 'string' }),
    /** for a `wait` step: when it releases */
    resumeAt: timestamp('resume_at', { withTimezone: true, mode: 'string' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    instanceIdx: index('workflow_task_instance_idx').on(t.instanceId, t.status),
    dueIdx: index('workflow_task_due_idx').on(t.status, t.dueAt),
    resumeIdx: index('workflow_task_resume_idx').on(t.status, t.resumeAt),
  }),
);

export const workflowTaskAssignee = pgTable(
  'workflow_task_assignee',
  {
    ...auditColumns,
    taskId: uuid('task_id').notNull(),
    instanceId: uuid('instance_id').notNull(),
    staffProfileId: uuid('staff_profile_id').notNull(),
    /** why this person was asked: role:<code> | user | group:<code> | dynamic:<source> | fallback | escalation | manual */
    source: text('source').notNull(),
    /** position for in-order steps (0 = first) */
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('pending'), // pending | decided | removed
    decision: text('decision'), // approve | reject | request_changes | complete
    comment: text('comment'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
    decidedByAccountId: uuid('decided_by_account_id'),
    /** the eligibility check ran and this person was the decider (vs. a monitor acting for them) */
    seenAt: timestamp('seen_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    taskStaffUnq: unique('workflow_task_assignee_unq').on(t.taskId, t.staffProfileId),
    // the inbox: my pending tasks
    inboxIdx: index('workflow_task_assignee_inbox_idx').on(t.staffProfileId, t.status),
    instanceIdx: index('workflow_task_assignee_instance_idx').on(t.instanceId),
  }),
);

/** Append-only history of everything that happened to a request. */
export const workflowEvent = pgTable(
  'workflow_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id').notNull(),
    taskId: uuid('task_id'),
    type: text('type').notNull(),
    actorAccountId: uuid('actor_account_id'),
    actorLabel: text('actor_label'),
    data: jsonb('data')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({ instanceIdx: index('workflow_event_instance_idx').on(t.instanceId, t.createdAt) }),
);
