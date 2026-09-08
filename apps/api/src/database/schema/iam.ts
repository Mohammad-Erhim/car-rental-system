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

import { auditColumns, actorColumns } from './_helpers';

/**
 * DAT-ACCOUNT (SRS §9.2) — a person's login identity. `kind` separates customer vs staff
 * audiences; the same table keeps credential + verification lifecycle in one place.
 */
export const account = pgTable(
  'account',
  {
    ...auditColumns,
    kind: text('kind').notNull(), // 'customer' | 'staff'
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(), // lower/trim for uniqueness
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'string' }),
    phone: text('phone'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true, mode: 'string' }),
    passwordHash: text('password_hash'), // argon2id; null when only external sign-in
    passwordAlgo: text('password_algo').default('argon2id'),
    status: text('status').notNull().default('pending'), // pending|active|suspended|locked|closed
    displayName: text('display_name').notNull(),
    localeCode: text('locale_code').notNull().default('en'),
    timezone: text('timezone'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'string' }),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true, mode: 'string' }),
    /** step-up: last time this account did a full password auth */
    lastFullAuthAt: timestamp('last_full_auth_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    emailUnq: uniqueIndex('account_email_normalized_unq').on(t.emailNormalized),
    kindStatusIdx: index('account_kind_status_idx').on(t.kind, t.status),
  }),
);

/**
 * DAT-SESSION (SRS §9.2 / SRS-SEC-002) — refresh session family. Opaque secret stored hashed,
 * rotated on use, reuse detection via `rotatedToId`, family revocation via `familyId`.
 */
export const session = pgTable(
  'session',
  {
    ...auditColumns,
    accountId: uuid('account_id').notNull(),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(), // sha-256 of the opaque refresh token
    audience: text('audience').notNull(), // customer|staff
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedReason: text('revoked_reason'),
    rotatedToId: uuid('rotated_to_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    tokenUnq: uniqueIndex('session_token_hash_unq').on(t.tokenHash),
    accountIdx: index('session_account_idx').on(t.accountId, t.revokedAt),
    familyIdx: index('session_family_idx').on(t.familyId),
  }),
);

/**
 * DAT-SESSION (challenge variant) — single-purpose expiring codes for contact verification and
 * account recovery. Stored as non-reversible hash, single-use, rate-controlled (SRS-SEC-004).
 */
export const authChallenge = pgTable(
  'auth_challenge',
  {
    ...auditColumns,
    accountId: uuid('account_id'),
    purpose: text('purpose').notNull(), // verify_email | verify_phone | recover | link_identity
    channel: text('channel').notNull(), // email | sms
    destination: text('destination').notNull(), // masked in logs
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    attemptCount: integer('attempt_count').notNull().default(0),
    supersededById: uuid('superseded_by_id'),
    deliveryStatus: text('delivery_status').notNull().default('queued'),
  },
  (t) => ({
    accountPurposeIdx: index('auth_challenge_account_purpose_idx').on(t.accountId, t.purpose),
    expiresIdx: index('auth_challenge_expires_idx').on(t.expiresAt),
  }),
);

/** DAT-ROLE (SRS §21.1 SRC-ROLE) — composed from system-fixed permission actions. */
export const role = pgTable(
  'role',
  {
    ...auditColumns,
    ...actorColumns,
    organizationId: uuid('organization_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    permissionActions: jsonb('permission_actions')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => ({ codeUnq: uniqueIndex('role_org_code_unq').on(t.organizationId, t.code) }),
);

/** LOOKUP-PERMISSION-ACTION (system-fixed) — the closed set roles are composed from. */
export const permissionAction = pgTable(
  'permission_action',
  {
    ...auditColumns,
    code: text('code').notNull(), // e.g. 'reservation.cancel', 'payment.refund'
    group: text('group').notNull(), // for grouping by risk in the role editor
    riskLevel: text('risk_level').notNull().default('normal'), // normal|elevated|high
    description: text('description').notNull(),
  },
  (t) => ({ codeUnq: uniqueIndex('permission_action_code_unq').on(t.code) }),
);

/** Staff profile — location/business scope + role assignments (FR-ADM-009). */
export const staffProfile = pgTable(
  'staff_profile',
  {
    ...auditColumns,
    ...actorColumns,
    accountId: uuid('account_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    /** location ids this staff member is scoped to; empty = org-wide within their roles */
    locationScope: jsonb('location_scope')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    roleCodes: jsonb('role_codes')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    approvalLimitMinor: integer('approval_limit_minor').notNull().default(0),
    status: text('status').notNull().default('invited'), // invited|active|suspended|deactivated
    invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'string' }),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    accountUnq: uniqueIndex('staff_profile_account_unq').on(t.accountId),
    orgIdx: index('staff_profile_org_idx').on(t.organizationId, t.status),
  }),
);
