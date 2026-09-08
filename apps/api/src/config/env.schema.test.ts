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
});
