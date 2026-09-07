import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { session } from '../../database/schema/iam';

import { TokenService } from './token.service';

export interface IssuedSession {
  refreshToken: string;
  familyId: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Refresh-session lifecycle (SRS-SEC-002): issue, rotate-on-use, reuse detection, and
 * family-wide revocation. A replayed (already-rotated) token revokes the whole family.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('SessionService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tokens: TokenService,
  ) {}

  async issue(input: {
    accountId: string;
    audience: 'customer' | 'staff';
    userAgent?: string;
    ip?: string;
    familyId?: string;
  }): Promise<IssuedSession> {
    const { token, hash } = this.tokens.newRefreshToken();
    const familyId = input.familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + this.tokens.refreshTtlMs());
    const [row] = await this.db
      .insert(session)
      .values({
        accountId: input.accountId,
        familyId,
        tokenHash: hash,
        audience: input.audience,
        userAgent: input.userAgent?.slice(0, 400),
        ip: input.ip,
        expiresAt: expiresAt.toISOString(),
        lastUsedAt: sql`now()`,
      })
      .returning({ id: session.id });
    return { refreshToken: token, familyId, sessionId: row!.id, expiresAt };
  }

  /**
   * Exchange a refresh token for a new one. Returns the account id on success.
   * Detects reuse of an already-rotated token and revokes the family.
   */
  async rotate(
    refreshToken: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<
    | { ok: true; accountId: string; audience: 'customer' | 'staff'; issued: IssuedSession }
    | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'reused' }
  > {
    const hash = this.tokens.hashRefresh(refreshToken);
    const [row] = await this.db.select().from(session).where(eq(session.tokenHash, hash)).limit(1);
    if (!row) return { ok: false, reason: 'not_found' };

    if (row.revokedAt) {
      // A revoked-but-presented token: if it was rotated, this is a reuse => nuke the family.
      if (row.rotatedToId) {
        await this.revokeFamily(row.familyId, 'reuse_detected');
        this.logger.warn(
          { familyId: row.familyId },
          'refresh token reuse detected — family revoked',
        );
        return { ok: false, reason: 'reused' };
      }
      return { ok: false, reason: 'revoked' };
    }

    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    const issued = await this.issue({
      accountId: row.accountId,
      audience: row.audience as 'customer' | 'staff',
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      familyId: row.familyId,
    });

    await this.db
      .update(session)
      .set({
        revokedAt: sql`now()`,
        revokedReason: 'rotated',
        rotatedToId: issued.sessionId,
        updatedAt: sql`now()`,
      })
      .where(eq(session.id, row.id));

    return {
      ok: true,
      accountId: row.accountId,
      audience: row.audience as 'customer' | 'staff',
      issued,
    };
  }

  async revokeByToken(refreshToken: string, reason = 'sign_out'): Promise<void> {
    const hash = this.tokens.hashRefresh(refreshToken);
    await this.db
      .update(session)
      .set({ revokedAt: sql`now()`, revokedReason: reason, updatedAt: sql`now()` })
      .where(and(eq(session.tokenHash, hash), isNull(session.revokedAt)));
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.db
      .update(session)
      .set({ revokedAt: sql`now()`, revokedReason: reason, updatedAt: sql`now()` })
      .where(and(eq(session.familyId, familyId), isNull(session.revokedAt)));
  }

  async revokeAllForAccount(accountId: string, reason: string): Promise<number> {
    const rows = await this.db
      .update(session)
      .set({ revokedAt: sql`now()`, revokedReason: reason, updatedAt: sql`now()` })
      .where(and(eq(session.accountId, accountId), isNull(session.revokedAt)))
      .returning({ id: session.id });
    return rows.length;
  }

  async listForAccount(accountId: string) {
    return this.db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        userAgent: session.userAgent,
        ip: session.ip,
        current: sql<boolean>`false`,
        revokedAt: session.revokedAt,
      })
      .from(session)
      .where(and(eq(session.accountId, accountId), isNull(session.revokedAt)))
      .orderBy(sql`${session.lastUsedAt} desc nulls last`);
  }
}
