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
