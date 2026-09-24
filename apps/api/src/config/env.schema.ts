import { z } from 'zod';

/** Every operator secret that ships a dev-only placeholder default — rejected outright in
 *  production (see the `.superRefine` below) so a forgotten override never silently ships. */
const INSECURE_PRODUCTION_DEFAULTS: Record<string, string> = {
  PAYMENT_CONFIG_ENCRYPTION_KEY: 'dev-payment-config-encryption-key-change',
  PAYMENT_WEBHOOK_SECRET: 'dev-payment-webhook-secret-change',
  OBJECT_STORAGE_SIGNING_SECRET: 'dev-object-signing-secret-change',
};

/**
 * An on/off environment flag. `z.coerce.boolean()` is NOT one — it is `Boolean(value)`, so the
 * strings "false", "0", "no" and "off" all came out `true`, and `RATE_LIMIT_ENABLED=0` (the
 * runbook's own emergency switch) did nothing. Here 1/true/yes/on and 0/false/no/off are read for
 * what they say (any case); empty means "not set"; anything else fails the boot loudly rather than
 * being guessed at.
 */
const envFlag = (fallback: boolean) =>
  z.preprocess((raw) => {
    if (typeof raw !== 'string') return raw;
    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    return v === '' ? undefined : raw;
  }, z.boolean().default(fallback));

/** Runtime environment contract. Validated once at boot; invalid config fails fast (SRS §5). */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  // Unset (default) = host-only refresh/CSRF cookies (iam.cookies.ts), the right choice when
  // site/ops/api share one origin. Set to the registrable domain (e.g. `.example.com`, leading
  // dot optional per RFC 6265) when they're split across sibling subdomains instead — otherwise
  // a cookie set while signing in on one subdomain is invisible on the others. Still
  // `SameSite=Lax`: sibling subdomains of one registrable domain are same-site, so this doesn't
  // reopen the cross-site CSRF surface DEC-021 avoided by using one origin.
  COOKIE_DOMAIN: z.string().optional(),
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
  /** Idle lifetime: every rotation renews the refresh token for this long. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Hard cap from the original sign-in — a rolling session can never outlive this. */
  REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().positive().default(90),
  /**
   * How long after a rotation the *previous* token is still honoured (it yields a sibling
   * session instead of tripping reuse detection). Absorbs concurrent tabs, retried requests and
   * lost responses; a replay after the window is treated as theft and revokes the family.
   */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(300).default(20),
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
  // DEC-016 plans SMS/push on the same outbox pattern as mail ("SMS/push use the same outbox
  // pattern with a dev viewer"), but neither is wired up anywhere yet — notify.service.ts's
  // 'sms'/'push' channels exist as a concept but never read these. Unlike MAIL_DRIVER (genuinely
  // implemented, see notify.service.ts), these two are declared ahead of the implementation.
  // Kept (not removed) because DEC-016 explicitly commits to building them; remove this comment
  // once a real driver reads them.
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

  MAPS_ENABLED: envFlag(false),
  MAP_STYLE_URL: z.string().optional(),

  /** SRS-SEC-015 — abuse controls. `RATE_LIMIT_ENABLED=false` disables the guard entirely.
   * `RATE_LIMIT_AUTH_MAX` requests per `RATE_LIMIT_AUTH_WINDOW_SEC` per client IP on auth routes. */
  RATE_LIMIT_ENABLED: envFlag(true),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(40),
  RATE_LIMIT_AUTH_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  /** Same shape as the auth preset, for the public quote+hold endpoint — unauthenticated with
   *  `hold: true` it places a real inventory hold, so it needs its own throttle against
   *  scripted hold-squatting. A separate env pair (not reusing RATE_LIMIT_AUTH_*) so ops can
   *  tune credential-guessing and inventory-squatting limits independently. */
  RATE_LIMIT_DISCOVERY_QUOTE_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_DISCOVERY_QUOTE_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  /** The payment step of checkout (`POST /bookings/confirm`, DEC-040). A guest reaches it with no
   *  account, and every call there is a card authorisation — which is exactly what card-testing
   *  ("does this stolen number work?") runs in bulk. Its own pair so conversion and abuse can be
   *  tuned apart from the quote and sign-in limits; per client IP, so keep it well above what one
   *  household or office legitimately books in a minute. */
  RATE_LIMIT_BOOKING_CONFIRM_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_BOOKING_CONFIRM_WINDOW_SEC: z.coerce.number().int().positive().default(60),

  /** SRS-SEC-014 — how recent a full password auth must be for a `@StepUp()` route (seconds). */
  STEP_UP_MAX_AGE_SEC: z.coerce.number().int().nonnegative().default(900),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Unset (default): tracing.ts never initialises the OpenTelemetry SDK at all — zero added
   *  latency, zero background export traffic, the honest zero-overhead state for a checkout that
   *  never asked for this. Set to an OTLP/HTTP traces endpoint (e.g. a Tempo instance's
   *  `http://tempo:4318/v1/traces`) to turn tracing on. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** Fraction of requests that get traced (the rest still work identically, just unrecorded) —
   *  the actual performance lever: exporting is already async/batched off the request path, so
   *  this controls the CPU cost of span creation itself and the export volume. 1 = trace
   *  everything (fine for low-traffic staging; reconsider under real production load). */
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(0.2),
  METRICS_ENABLED: envFlag(true),
  /** Shared secret required on the `X-Metrics-Token` header to read `/metrics` (SRS DEC-017)
   *  — that endpoint has no other auth (it must be scrapeable by an external Prometheus, which
   *  isn't a staff/customer actor) and otherwise hands any unauthenticated caller Node process
   *  internals + per-route request-rate/latency histograms. Optional: unset keeps today's
   *  behaviour (open) for a fresh local checkout; every real deployment should set it and point
   *  its scraper's `Authorization`/custom-header config at the same value. */
  METRICS_TOKEN: z.string().optional(),

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
