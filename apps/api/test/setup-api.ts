import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll } from 'vitest';

/**
 * Rebuilds the test database (DATABASE_URL_TEST) from scratch before the suite: drop schemas,
 * migrate empty->current, then seed system + test. Deterministic regardless of prior migration
 * history (SRS §22.3).
 */
process.env.NODE_ENV = 'test';

// SRS-SEC-015 rate limiter: a short window so the suite's many sign-ins never accumulate into a
// false 429, while `security.spec.ts` can still trip it with a quick burst from one IP.
process.env.RATE_LIMIT_AUTH_MAX ??= '25';
process.env.RATE_LIMIT_AUTH_WINDOW_SEC ??= '2';

function loadDotenv(path: string): boolean {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) {
        process.env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
      }
    }
    return true;
  } catch {
    return false;
  }
}

if (!loadDotenv(resolve(process.cwd(), '.env'))) loadDotenv(resolve(process.cwd(), '../../.env'));

let prepared = false;

beforeAll(() => {
  if (prepared) return;
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error('DATABASE_URL_TEST is required for API tests');
  if (!/_test$/.test(new URL(testUrl).pathname)) {
    throw new Error('DATABASE_URL_TEST must point at a database whose name ends in _test');
  }
  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    DATABASE_URL_TEST: testUrl,
    NODE_ENV: 'test' as const,
  };
  execSync('node -r @swc-node/register src/database/reset.ts --profile=test', {
    stdio: 'inherit',
    env,
  });
  prepared = true;
}, 120_000);
