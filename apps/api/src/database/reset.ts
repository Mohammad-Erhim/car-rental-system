/**
 * Drops and recreates the public schema, then re-migrates + seeds. Refuses to run against a
 * database whose name does not end in _dev or _test (guard against production).
 *
 *   node -r @swc-node/register src/database/reset.ts [--profile=development|test]
 */
import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDb } from './drizzle';
import { bootstrapEnvForScript } from './script-env';
import { runSeed } from './seed/seed';

const here = __dirname;

async function main() {
  const env = bootstrapEnvForScript();
  const profileArg = process.argv.find((a) => a.startsWith('--profile='))?.split('=')[1];
  const profile = (profileArg ?? 'development') as 'development' | 'test';
  const url =
    profile === 'test' && env.DATABASE_URL_TEST ? env.DATABASE_URL_TEST : env.DATABASE_URL;

  const dbName = new URL(url).pathname.replace('/', '');
  if (!/_dev$|_test$/.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}" — name must end in _dev or _test.`);
  }

  const { db, sql, close } = createDb(url, { max: 1 });
  try {
    // eslint-disable-next-line no-console
    console.log(`[reset] dropping schema public on ${dbName}`);
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    // eslint-disable-next-line no-console
    console.log('[reset] migrating');
    await migrate(db, { migrationsFolder: resolve(here, 'migrations') });
  } finally {
    await close();
  }

  await runSeed(url, profile);
  // eslint-disable-next-line no-console
  console.log('[reset] complete');
}

main().catch((err) => {
  console.error('[reset] failed:', err);
  process.exit(1);
});
