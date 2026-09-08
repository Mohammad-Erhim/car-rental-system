import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export function createDb(connectionString: string, opts?: { max?: number }): DbHandle {
  const sql = postgres(connectionString, {
    max: opts?.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // integers as JS numbers where safe; bigint stays string via the schema types
    prepare: true,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

export { schema };
