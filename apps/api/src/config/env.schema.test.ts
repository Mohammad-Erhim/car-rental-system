import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(30),
  PASSWORD_PEPPER: 'y'.repeat(20),
  COOKIE_SECRET: 'z'.repeat(20),
};

describe('env schema', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = envSchema.parse(BASE);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.OBJECT_STORAGE_DRIVER).toBe('fs');
  });

  it('rejects a short JWT secret and a non-url database', () => {
    expect(envSchema.safeParse({ ...BASE, JWT_ACCESS_SECRET: 'short' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, DATABASE_URL: 'not-a-url' }).success).toBe(false);
  });

  it('splits and trims CORS origins', () => {
    const env = envSchema.parse({
      ...BASE,
      CORS_ALLOWED_ORIGINS: 'http://a.test, http://b.test ,',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  describe('on/off flags say what they mean', () => {
    // `z.coerce.boolean()` made every non-empty string true — RATE_LIMIT_ENABLED=0 (the runbook's
    // own emergency switch) left the limiter running.
    const flag = (name: string, value: string) =>
      (envSchema.parse({ ...BASE, [name]: value }) as Record<string, unknown>)[name];

    it.each(['1', 'true', 'TRUE', 'yes', 'on', ' On '])('reads %j as on', (v) => {
      expect(flag('RATE_LIMIT_ENABLED', v)).toBe(true);
      expect(flag('MAPS_ENABLED', v)).toBe(true);
    });

    it.each(['0', 'false', 'False', 'no', 'off', ' OFF '])('reads %j as off', (v) => {
      expect(flag('RATE_LIMIT_ENABLED', v)).toBe(false);
      expect(flag('METRICS_ENABLED', v)).toBe(false);
      expect(flag('MAPS_ENABLED', v)).toBe(false);
    });

    it('falls back to the default for each flag when it is unset or empty', () => {
      const env = envSchema.parse(BASE);
      expect(env.RATE_LIMIT_ENABLED).toBe(true);
      expect(env.METRICS_ENABLED).toBe(true);
      expect(env.MAPS_ENABLED).toBe(false);
      const blank = envSchema.parse({ ...BASE, RATE_LIMIT_ENABLED: '', MAPS_ENABLED: '' });
      expect(blank.RATE_LIMIT_ENABLED).toBe(true);
      expect(blank.MAPS_ENABLED).toBe(false);
    });

    it('fails the boot on a value it cannot read, instead of guessing', () => {
      const r = envSchema.safeParse({ ...BASE, RATE_LIMIT_ENABLED: 'maybe' });
      expect(r.success).toBe(false);
      if (!r.success)
        expect(r.error.issues.map((i) => i.path.join('.'))).toContain('RATE_LIMIT_ENABLED');
    });
  });

  it('the checkout payment step has its own limiter: 20 per 60 s per client by default, tunable', () => {
    const env = envSchema.parse(BASE);
    expect(env.RATE_LIMIT_BOOKING_CONFIRM_MAX).toBe(20);
    expect(env.RATE_LIMIT_BOOKING_CONFIRM_WINDOW_SEC).toBe(60);
    const tuned = envSchema.parse({
      ...BASE,
      RATE_LIMIT_BOOKING_CONFIRM_MAX: '5',
      RATE_LIMIT_BOOKING_CONFIRM_WINDOW_SEC: '30',
    });
    expect([
      tuned.RATE_LIMIT_BOOKING_CONFIRM_MAX,
      tuned.RATE_LIMIT_BOOKING_CONFIRM_WINDOW_SEC,
    ]).toEqual([5, 30]);
  });

  describe('production must override the dev-only secret placeholders', () => {
    it('accepts the dev placeholders outside production (a fresh checkout still boots)', () => {
      expect(envSchema.safeParse({ ...BASE, NODE_ENV: 'development' }).success).toBe(true);
      expect(envSchema.safeParse({ ...BASE, NODE_ENV: 'test' }).success).toBe(true);
    });

    it('rejects every still-default placeholder in production, one issue per field', () => {
      const result = envSchema.safeParse({ ...BASE, NODE_ENV: 'production' });
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('PAYMENT_CONFIG_ENCRYPTION_KEY');
      expect(paths).toContain('PAYMENT_WEBHOOK_SECRET');
      expect(paths).toContain('OBJECT_STORAGE_SIGNING_SECRET');
    });

    it('passes in production once every placeholder is overridden with a real value', () => {
      const result = envSchema.safeParse({
        ...BASE,
        NODE_ENV: 'production',
        PAYMENT_CONFIG_ENCRYPTION_KEY: 'a-real-encryption-key-not-the-dev-default',
        PAYMENT_WEBHOOK_SECRET: 'a-real-webhook-secret-not-the-dev-default',
        OBJECT_STORAGE_SIGNING_SECRET: 'a-real-signing-secret-not-the-dev-default',
      });
      expect(result.success).toBe(true);
    });

    it('rejects in production if only some placeholders are overridden', () => {
      const result = envSchema.safeParse({
        ...BASE,
        NODE_ENV: 'production',
        PAYMENT_CONFIG_ENCRYPTION_KEY: 'a-real-encryption-key-not-the-dev-default',
        // PAYMENT_WEBHOOK_SECRET and OBJECT_STORAGE_SIGNING_SECRET left as defaults
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).not.toContain('PAYMENT_CONFIG_ENCRYPTION_KEY');
      expect(paths).toContain('PAYMENT_WEBHOOK_SECRET');
      expect(paths).toContain('OBJECT_STORAGE_SIGNING_SECRET');
    });
  });
});
