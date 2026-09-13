import { z } from 'zod';

/** Every operator secret that ships a dev-only placeholder default — rejected outright in
 *  production (see the `.superRefine` below) so a forgotten override never silently ships. */
const INSECURE_PRODUCTION_DEFAULTS: Record<string, string> = {
  PAYMENT_CONFIG_ENCRYPTION_KEY: 'dev-payment-config-encryption-key-change',
  PAYMENT_WEBHOOK_SECRET: 'dev-payment-webhook-secret-change',
  OBJECT_STORAGE_SIGNING_SECRET: 'dev-object-signing-secret-change',
};

/** Runtime environment contract. Validated once at boot; invalid config fails fast (SRS §5). */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),

  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379/0'),
  REDIS_URL_TEST: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(24),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().default('car-rental-system'),
  JWT_AUDIENCE_CUSTOMER: z.string().default('carrental.customer'),
  JWT_AUDIENCE_STAFF: z.string().default('carrental.staff'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_PEPPER: z.string().min(16),
  COOKIE_SECRET: z.string().min(16),

  OBJECT_STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  OBJECT_STORAGE_FS_ROOT: z.string().default('./var/objects'),
  OBJECT_STORAGE_SIGNING_SECRET: z.string().min(16).default('dev-object-signing-secret-change'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  MAIL_DRIVER: z.enum(['outbox', 'smtp']).default('outbox'),
  MAIL_FROM: z.string().default('Car Rental <no-reply@example.test>'),
  SMTP_URL: z.string().optional(),
  SMS_DRIVER: z.enum(['outbox', 'twilio']).default('outbox'),
  PUSH_DRIVER: z.enum(['outbox', 'fcm']).default('outbox'),

  // Legacy env-only switch — superseded by the DB-backed `payment_provider_config` row
  // (dashboard-configurable, SCREEN-OPS-041) so the active driver and Stripe keys can change
  // without a redeploy; kept only as the seed default for a brand-new install.
  PAYMENT_DRIVER: z.enum(['simulator', 'stripe']).default('simulator'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-payment-webhook-secret-change'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** At-rest encryption key for Stripe secret keys stored in the database (secret-cipher.ts) —
   *  an operator secret, same tier as PASSWORD_PEPPER/COOKIE_SECRET. MUST be overridden in
   *  production; the default here is a dev-only placeholder Zod rejects nowhere on purpose so a
   *  fresh checkout still boots, but every real deployment must set its own. */
  PAYMENT_CONFIG_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default('dev-payment-config-encryption-key-change'),

  MAPS_ENABLED: z.coerce.boolean().default(false),
  MAP_STYLE_URL: z.string().optional(),
  IDENTITY_DRIVER: z.enum(['simulator', 'manual']).default('simulator'),

  /** SRS-SEC-015 — abuse controls. `RATE_LIMIT_ENABLED=false` disables the guard entirely.
   * `RATE_LIMIT_AUTH_MAX` requests per `RATE_LIMIT_AUTH_WINDOW_SEC` per client IP on auth routes. */
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(40),
  RATE_LIMIT_AUTH_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  /** Same shape as the auth preset, for the public quote+hold endpoint — unauthenticated with
   *  `hold: true` it places a real inventory hold, so it needs its own throttle against
   *  scripted hold-squatting. A separate env pair (not reusing RATE_LIMIT_AUTH_*) so ops can
   *  tune credential-guessing and inventory-squatting limits independently. */
  RATE_LIMIT_DISCOVERY_QUOTE_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_DISCOVERY_QUOTE_WINDOW_SEC: z.coerce.number().int().positive().default(60),

  /** SRS-SEC-014 — how recent a full password auth must be for a `@StepUp()` route (seconds). */
  STEP_UP_MAX_AGE_SEC: z.coerce.number().int().nonnegative().default(900),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  METRICS_ENABLED: z.coerce.boolean().default(true),

  GIT_SHA: z.string().optional(),
  BUILD_TIME: z.string().optional(),
});

/** JWT_ACCESS_SECRET/PASSWORD_PEPPER/COOKIE_SECRET have no default at all, so a production boot
 *  with them unset already fails Zod's own `min()` check. PAYMENT_CONFIG_ENCRYPTION_KEY and its
 *  two siblings ship a dev-only placeholder *default* instead (so a fresh local checkout still
 *  boots without ceremony) — which means an unset production override wouldn't fail validation
 *  at all without this explicit check. Without it, every `compose.prod.yaml` deployment that
 *  forgets to set these encrypts Stripe live keys (and signs object-storage URLs / verifies
 *  webhooks) with a key that's sitting in plain sight in source control.
 */
export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'production') return;
  for (const [key, insecureDefault] of Object.entries(INSECURE_PRODUCTION_DEFAULTS)) {
    if (data[key as keyof typeof data] === insecureDefault) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is still the dev placeholder — set a real secret before running in production`,
      });
    }
  }
});

export type Env = z.infer<typeof baseEnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that need to re-read env after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}
