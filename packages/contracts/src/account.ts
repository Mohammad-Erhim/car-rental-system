import { z } from 'zod';

import { zId, zInstant } from './primitives';

/** Saved driver (FR-IAM-007, SCREEN-CUS-013). */
export const zDriver = z.object({
  id: zId,
  role: z.enum(['primary_renter', 'additional', 'payer']),
  fullName: z.string(),
  dateOfBirth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  licenceNumber: z.string().nullable(),
  licenceCountry: z.string().nullable(),
  licenceType: z.string().nullable(),
  licenceExpiresOn: z.string().nullable(),
  isSavedForReuse: z.boolean(),
});
export type Driver = z.infer<typeof zDriver>;

export const zAddDriverRequest = z.object({
  role: z.enum(['primary_renter', 'additional', 'payer']).default('additional'),
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  licenceNumber: z.string().max(80).optional(),
  // ISO-3166 alpha-2, normalized like `zMoney.currency` (primitives.ts) does for ISO-4217.
  licenceCountry: z.string().length(2).toUpperCase().optional(),
  licenceType: z.string().max(40).optional(),
  licenceExpiresOn: z.string().optional(),
});
export type AddDriverRequest = z.infer<typeof zAddDriverRequest>;

/** Account data request / closure (FR-IAM-008, SCREEN-CUS-024). */
export const zPrivacyRequest = z.object({
  id: zId,
  kind: z.enum(['access', 'correction', 'closure']),
  status: z.enum(['received', 'in_review', 'completed', 'rejected', 'cancelled', 'blocked']),
  blockers: z.array(z.object({ code: z.string(), detail: z.string() })).default([]),
  detail: z.string().nullable(),
  createdAt: zInstant,
});
export type PrivacyRequest = z.infer<typeof zPrivacyRequest>;

export const zCreatePrivacyRequest = z.object({
  kind: z.enum(['access', 'correction', 'closure']),
  detail: z.string().max(2000).optional(),
});
