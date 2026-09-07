import { sql } from 'drizzle-orm';
import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Standard aggregate columns (SRS-DAT-002): opaque stable id, created/updated instants (UTC),
 * and an optimistic-concurrency version. Consequential writes compare the expected version.
 */
export const auditColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .default(sql`now()`),
  version: integer('version').notNull().default(1),
};

/** Actor attribution for tables where "who/what changed this" matters (SRS-DAT-002). */
export const actorColumns = {
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

export function nowIso(): string {
  return new Date().toISOString();
}
