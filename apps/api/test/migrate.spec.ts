import { execFileSync } from 'node:child_process';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb, type DbHandle } from '../src/database/drizzle';

/**
 * TEST-DAT-010a (STAGE-000). Proves: a fresh empty database reaches current schema via the
 * migration runner, required system catalogues seed idempotently, and a re-run is a no-op.
 * Uses a disposable database `carrental_migtest`.
 */
const ADMIN_URL =
  process.env.DATABASE_URL_TEST?.replace(/\/[^/]+$/, '/postgres') ??
  'postgresql://carrental:carrental_dev_pw@127.0.0.1:5432/postgres';
const MIG_DB = 'carrental_migtest';
const MIG_URL = ADMIN_URL.replace(/\/postgres$/, `/${MIG_DB}`);

async function withAdmin<T>(fn: (h: DbHandle) => Promise<T>): Promise<T> {
  const h = createDb(ADMIN_URL, { max: 1 });
  try {
    return await fn(h);
  } finally {
    await h.close();
  }
}

describe('migrations (empty -> current)', () => {
  beforeAll(async () => {
    await withAdmin(async ({ sql: s }) => {
      await s.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${MIG_DB}' AND pid <> pg_backend_pid();`,
      );
      await s.unsafe(`DROP DATABASE IF EXISTS ${MIG_DB};`);
      await s.unsafe(`CREATE DATABASE ${MIG_DB};`);
    });
  }, 60_000);

  afterAll(async () => {
    await withAdmin(async ({ sql: s }) => {
      await s.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${MIG_DB}' AND pid <> pg_backend_pid();`,
      );
      await s.unsafe(`DROP DATABASE IF EXISTS ${MIG_DB};`);
    });
  }, 60_000);

  it('runs the migration runner against an empty DB and creates the schema', () => {
    execFileSync('node', ['-r', '@swc-node/register', 'src/database/migrate.ts'], {
      env: { ...process.env, DATABASE_URL: MIG_URL, MIGRATE_TARGET_URL: MIG_URL, NODE_ENV: 'test' },
      stdio: 'pipe',
    });
  });

  it('has the expected core tables and the drizzle migration ledger', async () => {
    const h = createDb(MIG_URL, { max: 1 });
    try {
      const tables = await h.db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      const names = tables.map((t) => t.table_name);
      expect(names).toEqual(
        expect.arrayContaining([
          'account',
          'audit_event',
          'idempotency_key',
          'locale',
          'location',
          'lookup_type',
          'lookup_value',
          'organization',
          'outbox_message',
          'permission_action',
          'role',
          'session',
          'staff_profile',
          'translation',
        ]),
      );
      const ledger = await h.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      expect(Number(ledger[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);
    } finally {
      await h.close();
    }
  });

  it('system seed is idempotent (second run changes no row counts)', async () => {
    const run = () =>
      execFileSync(
        'node',
        ['-r', '@swc-node/register', 'src/database/seed/seed.ts', '--profile=system'],
        {
          env: {
            ...process.env,
            DATABASE_URL: MIG_URL,
            SEED_TARGET_URL: MIG_URL,
            NODE_ENV: 'test',
          },
          stdio: 'pipe',
        },
      );
    run();
    const h = createDb(MIG_URL, { max: 1 });
    try {
      // `role` included deliberately (SRS-DAT-002-ish regression guard): a plain
      // UNIQUE(organization_id, code) never actually caught a second `(NULL, code)` row — SQL
      // treats NULL <> NULL — so re-seeding a database that already had roles silently doubled
      // every system role instead of updating it in place (caught live in the ops roles list,
      // not by this test, since `role` wasn't part of the aggregate it already checked).
      const countQuery = sql`select (select count(*) from lookup_value) + (select count(*) from lookup_type) + (select count(*) from locale) + (select count(*) from permission_action) + (select count(*) from role) as n`;
      const before = await h.db.execute<{ n: string }>(countQuery);
      run();
      const after = await h.db.execute<{ n: string }>(countQuery);
      expect(after[0]?.n).toBe(before[0]?.n);

      const roleCounts = await h.db.execute<{ code: string; n: string }>(
        sql`select code, count(*)::text as n from role group by code having count(*) > 1`,
      );
      expect(roleCounts).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it('migration runner re-run against the current DB is a no-op', () => {
    execFileSync('node', ['-r', '@swc-node/register', 'src/database/migrate.ts'], {
      env: { ...process.env, DATABASE_URL: MIG_URL, MIGRATE_TARGET_URL: MIG_URL, NODE_ENV: 'test' },
      stdio: 'pipe',
    });
  });
});
