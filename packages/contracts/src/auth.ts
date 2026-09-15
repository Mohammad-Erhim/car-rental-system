import { z } from 'zod';

import { zId, zInstant, zLocale } from './primitives';

export const zRegisterRequest = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  phone: z.string().max(40).optional(),
  localeCode: zLocale.default('en'),
  acceptTerms: z.literal(true),
  marketingOptIn: z.boolean().default(false),
  /** where checkout/task should resume after verification (SRS-UI-006) — same-origin relative
   *  path only. A single leading `/` not followed by a second `/` or a backslash: blocks both a
   *  protocol-relative URL (`//evil.example`) and the backslash variant browsers resolve the same
   *  way against an http(s) base (`/\evil.example`), as well as any absolute/scheme-prefixed URL,
   *  since none of those start with a bare `/`. */
  returnTo: z
    .string()
    .max(500)
    .regex(/^\/(?!\/)[^\s\\]*$/, 'must be a same-origin relative path')
    .optional(),
});
export type RegisterRequest = z.infer<typeof zRegisterRequest>;

export const zSignInRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  audience: z.enum(['customer', 'staff']).default('customer'),
});
export type SignInRequest = z.infer<typeof zSignInRequest>;

export const zSessionResponse = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number().int(),
  actor: z.object({
    accountId: zId,
    kind: z.enum(['customer', 'staff']),
    displayName: z.string(),
    localeCode: zLocale,
    emailVerified: z.boolean(),
    permissions: z.array(z.string()),
    roleCodes: z.array(z.string()),
    organizationId: zId.optional(),
    organizationName: z.string().optional(),
    locationScope: z.array(z.string()),
  }),
});
export type SessionResponse = z.infer<typeof zSessionResponse>;

export const zVerifyContactRequest = z.object({
  challengeId: zId,
  code: z.string().min(4).max(12),
});

export const zStartRecoveryRequest = z.object({
  email: z.string().email(),
  audience: z.enum(['customer', 'staff']).default('customer'),
});

export const zCompleteRecoveryRequest = z.object({
  challengeId: zId,
  code: z.string().min(4).max(12),
  newPassword: z.string().min(10).max(200),
});

export const zChangePasswordRequest = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
});

export const zChallengeCreatedResponse = z.object({
  challengeId: zId.nullable(),
  channel: z.enum(['email', 'sms']).nullable(),
  /** always the same neutral message regardless of whether the account exists */
  message: z.string(),
  /** dev only: the code, when the outbox mail driver is active */
  devCode: z.string().optional(),
  expiresAt: zInstant.nullable(),
});
export type ChallengeCreatedResponse = z.infer<typeof zChallengeCreatedResponse>;

export const zProfile = z.object({
  accountId: zId,
  fullName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  localeCode: zLocale,
  timezone: z.string().nullable(),
  address: z.record(z.string()),
  communicationPrefs: z.record(z.boolean()),
  version: z.number().int(),
});
export type Profile = z.infer<typeof zProfile>;

export const zUpdateProfileRequest = z.object({
  fullName: z.string().min(1).max(200).optional(),
  localeCode: zLocale.optional(),
  timezone: z.string().max(64).optional(),
  address: z.record(z.string()).optional(),
  communicationPrefs: z.record(z.boolean()).optional(),
});

export const zSessionSummary = z.object({
  id: zId,
  createdAt: zInstant,
  lastUsedAt: zInstant.nullable(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});
