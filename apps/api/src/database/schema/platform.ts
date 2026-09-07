import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns } from './_helpers';

/**
 * DAT-AUDIT (SRS §9.2, SRS-SEC-016) — append-only security/business audit trail.
 * `beforeSafe`/`afterSafe` hold masked diffs; sensitive values are redacted at write time.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    id: uuid('id').notNull().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
    actorType: text('actor_type').notNull(), // customer|staff|system|provider
    actorId: uuid('actor_id'),
    actorLabel: text('actor_label'),
    action: text('action').notNull(), // e.g. 'payment.refund.issued'
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    outcome: text('outcome').notNull().default('accepted'), // accepted|rejected|failed
    reason: text('reason'),
    beforeSafe: jsonb('before_safe').$type<Record<string, unknown>>(),
    afterSafe: jsonb('after_safe').$type<Record<string, unknown>>(),
    surface: text('surface'), // app-cweb|app-ops|worker|provider
    traceId: text('trace_id'),
    requestId: text('request_id'),
    organizationId: uuid('organization_id'),
  },
  (t) => ({
    idIdx: uniqueIndex('audit_event_id_unq').on(t.id),
    targetIdx: index('audit_event_target_idx').on(t.targetType, t.targetId),
    actionTimeIdx: index('audit_event_action_time_idx').on(t.action, t.occurredAt),
    actorIdx: index('audit_event_actor_idx').on(t.actorType, t.actorId),
  }),
);

/**
 * DAT-OUTBOX (SRS §9.2, SRS-FLOW-002) — transactional outbox. Inserted in the same tx as the
 * aggregate write; a worker delivers to read models / notifications / integrations.
 */
export const outboxMessage = pgTable(
  'outbox_message',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    id: uuid('id').notNull().defaultRandom(),
    eventType: text('event_type').notNull(), // e.g. 'reservation.confirmed.v1'
    eventVersion: integer('event_version').notNull().default(1),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    aggregateVersion: integer('aggregate_version').notNull().default(1),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'string' }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    traceId: text('trace_id'),
  },
  (t) => ({
    idUnq: uniqueIndex('outbox_message_id_unq').on(t.id),
    pendingIdx: index('outbox_pending_idx').on(t.deliveredAt, t.availableAt),
    aggregateIdx: index('outbox_aggregate_idx').on(t.aggregateType, t.aggregateId),
  }),
);

/**
 * DAT-IDEMPOTENCY (SRS §9.2, SRS-API-006) — command deduplication. Uniqueness on
 * (actor, operation, key); a replay with a different fingerprint is a conflict.
 */
export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    ...auditColumns,
    actorKey: text('actor_key').notNull(), // pseudonymous actor + audience
    operation: text('operation').notNull(),
    key: text('key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: text('status').notNull().default('in_progress'), // in_progress|completed|failed
    resultRef: text('result_ref'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    unq: uniqueIndex('idempotency_actor_op_key_unq').on(t.actorKey, t.operation, t.key),
    expiresIdx: index('idempotency_expires_idx').on(t.expiresAt),
  }),
);

/** Background job records (DAT-JOB) — survive browser close, bounded retries (SRS §9.2). */
export const job = pgTable(
  'job',
  {
    ...auditColumns,
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'), // queued|running|completed|failed|cancelled
    ownerAccountId: uuid('owner_account_id'),
    organizationId: uuid('organization_id'),
    inputChecksum: text('input_checksum'),
    input: jsonb('input').$type<Record<string, unknown>>(),
    progress: integer('progress').notNull().default(0),
    resultRef: text('result_ref'),
    acceptedCount: integer('accepted_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({ statusIdx: index('job_status_idx').on(t.status, t.type) }),
);

/** Stored/generated file metadata (DAT-DOCUMENT base) — content lives in object storage. */
export const storedObject = pgTable(
  'stored_object',
  {
    ...auditColumns,
    purpose: text('purpose').notNull(), // driver_licence|inspection_photo|receipt|export|...
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id'),
    objectKey: text('object_key').notNull(),
    mediaType: text('media_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    checksumSha256: text('checksum_sha256'),
    scanState: text('scan_state').notNull().default('pending'), // pending|clean|infected|error
    reviewState: text('review_state').notNull().default('none'), // none|pending|verified|rejected
    retentionUntil: timestamp('retention_until', { withTimezone: true, mode: 'string' }),
    uploadComplete: text('upload_complete').notNull().default('no'),
  },
  (t) => ({
    keyUnq: uniqueIndex('stored_object_key_unq').on(t.objectKey),
    ownerIdx: index('stored_object_owner_idx').on(t.ownerType, t.ownerId),
  }),
);
