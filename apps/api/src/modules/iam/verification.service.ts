import { createHash, randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { authChallenge } from '../../database/schema/iam';
import { NotifyService } from '../notify/notify.service';

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 6;

export type ChallengePurpose = 'verify_email' | 'verify_phone' | 'recover' | 'link_identity';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Single-purpose, expiring, single-use, rate-controlled challenges (SRS-SEC-004).
 * Responses avoid account enumeration — the caller always gets a neutral message.
 */
@Injectable()
export class VerificationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notify: NotifyService,
  ) {}

  async create(input: {
    accountId?: string;
    purpose: ChallengePurpose;
    channel: 'email' | 'sms';
    destination: string;
    localeCode?: string;
    notifyEvent: string;
    variables?: Record<string, unknown>;
  }): Promise<{ challengeId: string; expiresAt: Date; devCode?: string }> {
    // rate control: supersede an unconsumed recent challenge for the same purpose+destination
    if (input.accountId) {
      const [recent] = await this.db
        .select()
        .from(authChallenge)
        .where(
          and(
            eq(authChallenge.accountId, input.accountId),
            eq(authChallenge.purpose, input.purpose),
            isNull(authChallenge.consumedAt),
          ),
        )
        .orderBy(desc(authChallenge.createdAt))
        .limit(1);
      if (recent && Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS) {
        // within cooldown — reuse the existing challenge id, do not send again
        return { challengeId: recent.id, expiresAt: new Date(recent.expiresAt) };
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    const [row] = await this.db
      .insert(authChallenge)
      .values({
        accountId: input.accountId ?? null,
        purpose: input.purpose,
        channel: input.channel,
        destination: input.destination,
        codeHash: hashCode(code),
        expiresAt: expiresAt.toISOString(),
        deliveryStatus: 'queued',
      })
      .returning({ id: authChallenge.id });

    // invalidate older unconsumed challenges of the same purpose for this account, linking each
    // to the challenge that superseded it — the new row must exist first to link to, which is
    // why this runs after the insert above rather than before it.
    if (input.accountId) {
      await this.db
        .update(authChallenge)
        .set({ supersededById: row!.id, consumedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            eq(authChallenge.accountId, input.accountId),
            eq(authChallenge.purpose, input.purpose),
            isNull(authChallenge.consumedAt),
            sql`${authChallenge.id} != ${row!.id}`,
          ),
        );
    }

    await this.notify.send({
      event: input.notifyEvent,
      channel: input.channel,
      recipient: input.destination,
      recipientRef: input.accountId,
      localeCode: input.localeCode,
      variables: { code, ...input.variables },
      sourceType: 'auth_challenge',
      sourceId: row!.id,
      fallback: {
        subject: `Your verification code: ${code}`,
        body: `Your ${input.purpose.replace('_', ' ')} code is ${code}. It expires in 15 minutes.`,
      },
    });

    await this.db
      .update(authChallenge)
      .set({ deliveryStatus: 'sent', updatedAt: sql`now()` })
      .where(eq(authChallenge.id, row!.id));

    return {
      challengeId: row!.id,
      expiresAt,
      devCode: this.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  /** Consume a challenge. Returns the accountId on success. Single-use; attempt-limited. */
  async consume(
    challengeId: string,
    code: string,
  ): Promise<
    | { ok: true; accountId: string | null; purpose: ChallengePurpose }
    | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'incorrect' | 'locked' }
  > {
    const [row] = await this.db
      .select()
      .from(authChallenge)
      .where(eq(authChallenge.id, challengeId))
      .limit(1);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.consumedAt) return { ok: false, reason: 'used' };
    if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };
    if (row.attemptCount >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

    if (row.codeHash !== hashCode(code)) {
      await this.db
        .update(authChallenge)
        .set({ attemptCount: row.attemptCount + 1, updatedAt: sql`now()` })
        .where(eq(authChallenge.id, challengeId));
      return { ok: false, reason: 'incorrect' };
    }

    await this.db
      .update(authChallenge)
      .set({ consumedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(authChallenge.id, challengeId));

    return { ok: true, accountId: row.accountId, purpose: row.purpose as ChallengePurpose };
  }
}
