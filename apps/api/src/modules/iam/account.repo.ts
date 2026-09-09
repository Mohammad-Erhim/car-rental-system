import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account } from '../../database/schema/iam';

export type AccountRow = typeof account.$inferSelect;

/**
 * Data access for the `account` aggregate. The by-id / by-email lookup was hand-built in ~7
 * places across IamService and ProfileService; centralising it here is the seam where a
 * soft-delete filter, a read replica, or per-query caching would later go (see CLAUDE.md ·
 * Data access).
 */
@Injectable()
export class AccountRepo {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<AccountRow | null> {
    const [row] = await this.db.select().from(account).where(eq(account.id, id)).limit(1);
    return row ?? null;
  }

  async findByEmailNormalized(emailNormalized: string): Promise<AccountRow | null> {
    const [row] = await this.db
      .select()
      .from(account)
      .where(eq(account.emailNormalized, emailNormalized))
      .limit(1);
    return row ?? null;
  }

  /** Patch a row and bump `updatedAt`. Returns the updated row (empty patch → a plain touch). */
  async update(id: string, patch: Partial<AccountRow>): Promise<AccountRow | null> {
    const [row] = await this.db
      .update(account)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(account.id, id))
      .returning();
    return row ?? null;
  }
}
