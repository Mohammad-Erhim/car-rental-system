import { z } from 'zod';

import { ERROR_CODE } from './errors';

/**
 * API error envelope (SRS §14.1, SRS-API-004/008).
 * - `code` is a stable machine string; the client resolves a localized message.
 * - `params` are safe interpolation values for that message (no secrets, no record existence).
 * - `fieldErrors` use the same field/path model as client-side validation (STATE-VALIDATION).
 * - `correlationId` lets support trace the request across logs/traces (SRS-OBS-003).
 * - `currentVersion` / `existingResultRef` help the client recover from conflict/duplicate.
 */
export const zFieldError = z.object({
  path: z.string(), // dotted path, e.g. "renter.licence.expiry"
  code: z.string(), // stable sub-code, e.g. "required" | "expired" | "too_short"
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type FieldError = z.infer<typeof zFieldError>;

export const zProblem = z.object({
  code: z.string(),
  category: z.string(),
  status: z.number().int(),
  title: z.string(), // short, non-localized developer-facing summary
  correlationId: z.string(),
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  fieldErrors: z.array(zFieldError).optional(),
  retryable: z.boolean().optional(),
  currentVersion: z.number().int().optional(),
  currentState: z.string().optional(),
  existingResultRef: z.string().optional(),
});
export type Problem = z.infer<typeof zProblem>;

export function isProblem(value: unknown): value is Problem {
  return zProblem.safeParse(value).success;
}

export const KNOWN_ERROR_CODES = Object.values(ERROR_CODE);
