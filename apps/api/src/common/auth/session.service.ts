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

  async issue(
    input: {
      accountId: string;
      audience: 'customer' | 'staff';
      userAgent?: string;
      ip?: string;
      familyId?: string;
      /** Hard ceiling for `expiresAt` (the family's absolute lifetime). */
      notAfter?: Date;
    },
    exec: Pick<Database, 'insert'> = this.db,
  ): Promise<IssuedSession> {
    const { token, hash } = this.tokens.newRefreshToken();
    const familyId = input.familyId ?? randomUUID();
    const now = Date.now();
    const absoluteEnd = input.notAfter?.getTime() ?? now + this.tokens.refreshAbsoluteTtlMs();
    const expiresAt = new Date(Math.min(now + this.tokens.refreshTtlMs(), absoluteEnd));
    const [row] = await exec
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
   * Exchange a refresh token for a new one.
   *
   * Runs in one transaction holding a row lock on the presented token, so two concurrent
   * refreshes (two tabs, a retry racing its original) are serialised instead of both seeing the
   * token as unused. The loser then finds the token freshly rotated and lands in the grace path:
   * within `REFRESH_REUSE_GRACE_SECONDS` a rotated token yields a *sibling* session in the same
   * family rather than a family revocation — a benign race must never sign the user out. Only a
   * replay after the window (or of a token that was revoked for another reason) is treated as
   * theft. `expectedAudience` (the surface asking) must match the session's audience.
   */
  async rotate(
    refreshToken: string,
    ctx: { userAgent?: string; ip?: string },
    expectedAudience?: 'customer' | 'staff',
  ): Promise<
    | {
        ok: true;
        accountId: string;
        audience: 'customer' | 'staff';
        issued: IssuedSession;
        graceReplay: boolean;
      }
    | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'reused' | 'audience_mismatch' }
  > {
    const hash = this.tokens.hashRefresh(refreshToken);
    const outcome = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(session)
        .where(eq(session.tokenHash, hash))
        .limit(1)
        .for('update');
      if (!row) return { ok: false as const, reason: 'not_found' as const };

      const audience = row.audience as 'customer' | 'staff';
      if (expectedAudience && audience !== expectedAudience) {
        return { ok: false as const, reason: 'audience_mismatch' as const };
      }

      const [family] = await tx
        .select({ start: sql<string>`min(${session.createdAt})` })
        .from(session)
        .where(eq(session.familyId, row.familyId));
      const notAfter = new Date(
        new Date(family?.start ?? row.createdAt).getTime() + this.tokens.refreshAbsoluteTtlMs(),
      );

      if (row.revokedAt) {
        if (row.revokedReason !== 'rotated') {
          return { ok: false as const, reason: 'revoked' as const };
        }
        const age = Date.now() - new Date(row.revokedAt).getTime();
        if (age <= this.tokens.reuseGraceMs() && notAfter.getTime() > Date.now()) {
          // The token was rotated moments ago. Honour it only while the chain it led to is
          // still alive (not signed out / family-revoked in the meantime).
          const successor = row.rotatedToId
            ? (
                await tx
                  .select({ revokedAt: session.revokedAt, revokedReason: session.revokedReason })
                  .from(session)
                  .where(eq(session.id, row.rotatedToId))
                  .limit(1)
              )[0]
            : undefined;
          const chainAlive =
            successor && (!successor.revokedAt || successor.revokedReason === 'rotated');
          if (chainAlive) {
            const issued = await this.issue(
              {
                accountId: row.accountId,
                audience,
                userAgent: ctx.userAgent,
                ip: ctx.ip,
                familyId: row.familyId,
                notAfter,
              },
              tx,
            );
            return {
              ok: true as const,
              accountId: row.accountId,
              audience,
              issued,
              graceReplay: true,
            };
          }
          return { ok: false as const, reason: 'revoked' as const };
        }
        await tx
          .update(session)
          .set({ revokedAt: sql`now()`, revokedReason: 'reuse_detected', updatedAt: sql`now()` })
          .where(and(eq(session.familyId, row.familyId), isNull(session.revokedAt)));
        return { ok: false as const, reason: 'reused' as const, familyId: row.familyId };
      }

      if (new Date(row.expiresAt).getTime() < Date.now() || notAfter.getTime() <= Date.now()) {
        return { ok: false as const, reason: 'expired' as const };
      }

      const issued = await this.issue(
        {
          accountId: row.accountId,
          audience,
          userAgent: ctx.userAgent,
          ip: ctx.ip,
          familyId: row.familyId,
          notAfter,
        },
        tx,
      );
      await tx
        .update(session)
        .set({
          revokedAt: sql`now()`,
          revokedReason: 'rotated',
          rotatedToId: issued.sessionId,
          lastUsedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(session.id, row.id));
      return { ok: true as const, accountId: row.accountId, audience, issued, graceReplay: false };
    });

    if (!outcome.ok && outcome.reason === 'reused') {
      this.logger.warn(
        { familyId: (outcome as { familyId?: string }).familyId },
        'refresh token reuse detected — family revoked',
      );
    }
    if (outcome.ok && outcome.graceReplay) {
      this.logger.log('refresh token replayed inside the grace window — issued a sibling session');
    }
    return outcome.ok ? outcome : { ok: false, reason: outcome.reason };
  }

  /**
   * Housekeeping (there is no scheduler): drop this account's dead sessions so `session` doesn't
   * grow by one row per token rotation forever.
   *  - rotated/revoked rows older than 14 days, EXCEPT each family's oldest row — its `created_at`
   *    is the family's sign-in time, which the absolute session lifetime is measured from;
   *  - families that are entirely finished (every row expired 7+ days ago, or revoked 14+ days ago).
   * Recent revoked rows are kept on purpose: they are what reuse detection and the grace window
   * recognise. Best-effort; a failure here never affects a sign-in or refresh.
   */
  async pruneAccount(accountId: string): Promise<void> {
    try {
      await this.db.execute(sql`
        delete from session s
        where s.account_id = ${accountId}
          and s.revoked_at < now() - interval '14 days'
          and s.created_at > (select min(f.created_at) from session f where f.family_id = s.family_id)`);
      await this.db.execute(sql`
        delete from session
        where account_id = ${accountId}
          and family_id in (
            select family_id from session where account_id = ${accountId}
            group by family_id
            having max(expires_at) < now() - interval '7 days'
                or (bool_and(revoked_at is not null) and max(revoked_at) < now() - interval '14 days'))`);
    } catch (err) {
      this.logger.warn({ err }, 'session prune failed');
    }
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
