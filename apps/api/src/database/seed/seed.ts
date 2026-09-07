/**
 * Seed entrypoint (SRS-DAT-011). Profiles:
 *   system      — required catalogues + system-fixed invariants (also runs in production)
 *   development — synthetic operating data for local use
 *   test        — deterministic minimal fixtures for the test suite
 *
 *   node -r @swc-node/register src/database/seed/seed.ts [--profile=system|development|test|all]
 */
import { createDb } from '../drizzle';
import { bootstrapEnvForScript } from '../script-env';

import { seedDevelopment } from './development';
import { seedSystem } from './system';
import { seedTest } from './test';

type Profile = 'system' | 'development' | 'test' | 'all';

function parseProfile(): Profile {
  const arg = process.argv.find((a) => a.startsWith('--profile='));
  const value = (arg?.split('=')[1] ?? process.env.SEED_PROFILE ?? 'all') as Profile;
  if (!['system', 'development', 'test', 'all'].includes(value)) {
    throw new Error(`Unknown seed profile: ${value}`);
  }
  return value;
}

export async function runSeed(connectionString: string, profile: Profile): Promise<void> {
  const { db, close } = createDb(connectionString, { max: 1 });
  try {
    if (
      profile === 'system' ||
      profile === 'all' ||
      profile === 'development' ||
      profile === 'test'
    ) {
      // eslint-disable-next-line no-console
      console.log('[seed] system…');
      await seedSystem(db);
    }
    if (profile === 'development' || profile === 'all') {
      // eslint-disable-next-line no-console
      console.log('[seed] development…');
      await seedDevelopment(db);
    }
    if (profile === 'test') {
      // eslint-disable-next-line no-console
      console.log('[seed] test…');
      await seedTest(db);
    }
    // eslint-disable-next-line no-console
    console.log('[seed] done');
  } finally {
    await close();
  }
}

if (require.main === module) {
  const env = bootstrapEnvForScript();
  const profile = parseProfile();
  const target =
    profile === 'test' && env.DATABASE_URL_TEST ? env.DATABASE_URL_TEST : env.DATABASE_URL;
  runSeed(process.env.SEED_TARGET_URL ?? target, profile).catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
