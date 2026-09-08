/**
 * Migration runner (SRS-DAT-010). Applies ordered SQL migrations from ./migrations against the
 * target database. Safe to run repeatedly (drizzle tracks applied migrations in a meta table).
 *
 *   node -r @swc-node/register src/database/migrate.ts          # uses DATABASE_URL
 *   DATABASE_URL=... node -r @swc-node/register src/database/migrate.ts
 */
import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDb } from './drizzle';
import { bootstrapEnvForScript } from './script-env';

// Run via @swc-node/register (CommonJS); __dirname is available.
const here = __dirname;

async function main() {
  const env = bootstrapEnvForScript();
  const target = process.env.MIGRATE_TARGET_URL ?? env.DATABASE_URL;
  const migrationsFolder = resolve(here, 'migrations');

  // eslint-disable-next-line no-console
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  const { db, close } = createDb(target, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
    // eslint-disable-next-line no-console
    console.log('[migrate] up to date');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
