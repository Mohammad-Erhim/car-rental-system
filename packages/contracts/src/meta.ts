import { z } from 'zod';

import { zLocale } from './primitives';

/** `GET /api/v1/meta/locales` — enabled locales come from the DB (SRS-I18N-001, FR-GBL-002). */
export const zLocaleInfo = z.object({
  code: zLocale,
  nativeName: z.string(),
  englishName: z.string(),
  direction: z.enum(['ltr', 'rtl']),
  isDefault: z.boolean(),
  fallback: z.array(zLocale),
  testOnly: z.boolean(),
});
export type LocaleInfo = z.infer<typeof zLocaleInfo>;

export const zLocalesResponse = z.object({
  defaultLocale: zLocale,
  locales: z.array(zLocaleInfo),
});
export type LocalesResponse = z.infer<typeof zLocalesResponse>;

/** `GET /api/v1/meta/build` */
export const zBuildInfo = z.object({
  name: z.string(),
  version: z.string(),
  gitSha: z.string().nullable(),
  builtAt: z.string(),
  nodeEnv: z.string(),
  schemaVersion: z.string().nullable(),
});
export type BuildInfo = z.infer<typeof zBuildInfo>;

/** `GET /api/v1/meta/health-summary` — safe, coarse status for the UI status bar (FR-GBL-005). */
export const zHealthSummary = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checkedAt: z.string(),
  components: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['ok', 'degraded', 'down']),
    }),
  ),
});
export type HealthSummary = z.infer<typeof zHealthSummary>;

/** `/health/ready` — richer, used by ops + load balancers (SRS §16.3). */
export const zReadiness = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checks: z.record(
    z.object({
      status: z.enum(['ok', 'degraded', 'down']),
      detail: z.string().optional(),
      durationMs: z.number().optional(),
    }),
  ),
});
export type Readiness = z.infer<typeof zReadiness>;
