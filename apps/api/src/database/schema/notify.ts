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
  uuid,
} from 'drizzle-orm/pg-core';

import { actorColumns, auditColumns } from './_helpers';

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
    /** sender identity applied from the event rule (FR-ADM-011), e.g. 'bookings' */
    sender: text('sender'),
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
 * FR-ADM-011 event-rules half — per (event, channel) delivery policy: trigger toggle, audience,
 * timing (send delay + quiet hours), retry + escalation, sender identity. The template table
 * owns the *content*; this owns *when / to whom / how* a message goes out. One row per
 * (event, channel); absence means "use the built-in default".
 */
export const notificationRule = pgTable(
  'notification_rule',
  {
    ...auditColumns,
    ...actorColumns,
    event: text('event').notNull(),
    channel: text('channel').notNull().default('email'),
    enabled: boolean('enabled').notNull().default(true),
    /** primary_renter | account_holder | all_drivers | ops */
    audience: text('audience').notNull().default('primary_renter'),
    /** minutes to wait after the trigger before sending (0 = immediate) */
    delayMinutes: integer('delay_minutes').notNull().default(0),
    /** defer into a window: { start:'HH:MM', end:'HH:MM' } in the recipient's zone, or null */
    quietHours: jsonb('quiet_hours').$type<{ start: string; end: string } | null>(),
    maxAttempts: integer('max_attempts').notNull().default(3),
    retryBackoffMinutes: integer('retry_backoff_minutes').notNull().default(15),
    /** open an ops task after this many failed attempts (null = never) */
    escalateAfterAttempts: integer('escalate_after_attempts'),
    /** local-part of the From identity, e.g. 'bookings' | 'support' */
    senderIdentity: text('sender_identity'),
  },
  (t) => ({
    eventChannelUnq: uniqueIndex('notification_rule_event_channel_unq').on(t.event, t.channel),
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
    ...actorColumns,
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

/**
 * DAT-EMAIL-PROVIDER-CONFIG (mirrors `paymentProviderConfig`). One row per organization — the
 * dashboard-configurable switch between the local outbox driver (dev/simulator — messages persist
 * to `notification` and are shown at /ops/dev/mail, never actually delivered) and a real SMTP
 * provider. The SMTP password is never stored in plaintext, only its AES-256-GCM ciphertext
 * (secret-cipher.ts); `*Last4`/`configuredAt` are plaintext-safe display metadata. Writes are
 * `email.manage`-gated (administrator only, never bundled into the generic 'ALL' role grant, same
 * tier as `payment.manage`) and step-up-confirmed.
 */
export const emailProviderConfig = pgTable('email_provider_config', {
  ...auditColumns,
  ...actorColumns,
  organizationId: uuid('organization_id').notNull().unique(),
  activeDriver: text('active_driver').notNull().default('outbox'), // outbox|smtp
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpSecure: boolean('smtp_secure').notNull().default(true),
  smtpUsername: text('smtp_username'),
  smtpPasswordCiphertext: text('smtp_password_ciphertext'),
  smtpPasswordLast4: text('smtp_password_last4'),
  fromAddress: text('from_address'),
  fromName: text('from_name'),
  configuredAt: timestamp('configured_at', { withTimezone: true, mode: 'string' }),
  /** a real SMTP connection (`transporter.verify()`) made at save time so a bad host/credential
   *  is rejected immediately rather than discovered on the next customer email (mirrors
   *  FR-PAY-010's pattern). */
  verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }),
});
