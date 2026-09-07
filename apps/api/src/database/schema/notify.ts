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

import { auditColumns } from './_helpers';

/**
 * DAT-NOTIFICATION (SRS §9.2) — message intent + attempt. Delivery is separate from the domain
 * action (FR-INT-002, BR-022). The local `outbox` mail driver (DEC-016) persists the rendered
 * message here and exposes it at /ops/dev/mail.
 */
export const notification = pgTable(
  'notification',
  {
    ...auditColumns,
    event: text('event').notNull(), // -> lookup notification_event
    channel: text('channel').notNull(), // email | sms | push
    recipient: text('recipient').notNull(), // masked in logs
    recipientRef: uuid('recipient_ref'), // account/customer id when known
    localeCode: text('locale_code').notNull().default('en'),
    templateKey: text('template_key'),
    templateVersion: text('template_version'),
    subject: text('subject'),
    body: text('body').notNull(),
    /** structured variables used to render (for regeneration / audit) */
    variables: jsonb('variables')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    deliveryState: text('delivery_state').notNull().default('queued'),
    // queued | sent | delivered | failed | suppressed | retried
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    /** correlation to the domain event that triggered it */
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    traceId: text('trace_id'),
  },
  (t) => ({
    eventIdx: index('notification_event_idx').on(t.event, t.deliveryState),
    recipientIdx: index('notification_recipient_idx').on(t.recipientRef),
    stateIdx: index('notification_state_idx').on(t.deliveryState, t.createdAt),
  }),
);

/**
 * DAT-TEMPLATE (SRS §9.2) — notification/document template version. Stable key + locale +
 * variables + review/publish status. Prior sent version retained on the notification row.
 */
export const template = pgTable(
  'template',
  {
    ...auditColumns,
    key: text('key').notNull(), // e.g. 'account_verification'
    channel: text('channel').notNull(),
    localeCode: text('locale_code').notNull(),
    version: text('version').notNull(),
    subject: text('subject'),
    bodyTemplate: text('body_template').notNull(),
    /** declared variables + which are required legal content */
    variables: jsonb('variables')
      .$type<Array<{ name: string; required?: boolean; legal?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('draft'), // draft | in_review | published | paused | retired
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    publishedBy: uuid('published_by'),
  },
  (t) => ({
    keyLocaleIdx: index('template_key_locale_idx').on(t.key, t.channel, t.localeCode, t.status),
    versionUnq: uniqueIndex('template_key_channel_locale_version_unq').on(
      t.key,
      t.channel,
      t.localeCode,
      t.version,
    ),
  }),
);
