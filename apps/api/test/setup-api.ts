import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll } from 'vitest';

/**
 * Ensures the test database (DATABASE_URL_TEST) is migrated + system/test seeded before any API
 * spec runs. Idempotent; cheap on re-run.
 */
process.env.NODE_ENV = 'test';

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
  const env = { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' as const };
  execSync('node -r @swc-node/register src/database/migrate.ts', { stdio: 'inherit', env });
  execSync('node -r @swc-node/register src/database/seed/seed.ts --profile=system', {
    stdio: 'inherit',
    env,
  });
  execSync('node -r @swc-node/register src/database/seed/seed.ts --profile=test', {
    stdio: 'inherit',
    env: { ...env, DATABASE_URL_TEST: testUrl },
  });
  prepared = true;
}, 120_000);
