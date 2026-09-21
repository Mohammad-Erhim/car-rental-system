import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { idempotencyKey } from '../../database/schema/platform';
import { AppError } from '../app-error';

export interface IdempotencyHit {
  status: 'replay';
  responseStatus: number;
  responseBody: unknown;
}
export interface IdempotencyMiss {
  status: 'proceed';
  finalize: (responseStatus: number, responseBody: unknown, resultRef?: string) => Promise<void>;
}

const TTL_MS = 24 * 60 * 60 * 1000;
/** How long an `in_progress` claim is honoured before a caller that opted into `retryFailed` may take
 *  it over: whoever made it is presumed dead (a crash, a deploy, or `finalize` itself failing). */
const CLAIM_LEASE_SEC = 5 * 60;

/**
 * Consequential-command deduplication (SRS-API-006). Keyed by (actor, operation, key).
 * A replay with a matching fingerprint returns the stored result; a mismatched fingerprint
 * is a conflict.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DB) private readonly db: Database) {}

  fingerprint(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
  }

  /**
   * `retryFailed` is for a caller whose sender retries it — a provider webhook. Such a caller must
   * not be handed back its own stored failure as if it were a completed run: the retry would be
   * answered "already handled" for an event that never was (DEC-039). With it, a `failed` claim —
   * or an `in_progress` one older than {@link CLAIM_LEASE_SEC} — is taken over atomically (exactly
   * one concurrent retry wins) and re-run. Off by default: a client-facing command replays its
   * stored result, failures included.
   */
  async begin(input: {
    actorKey: string;
    operation: string;
    key: string;
    body: unknown;
    retryFailed?: boolean;
  }): Promise<IdempotencyHit | IdempotencyMiss> {
    const fp = this.fingerprint(input.body);
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    const inserted = await this.db
      .insert(idempotencyKey)
      .values({
        actorKey: input.actorKey,
        operation: input.operation,
        key: input.key,
        requestFingerprint: fp,
        status: 'in_progress',
        expiresAt,
      })
      .onConflictDoNothing({
        target: [idempotencyKey.actorKey, idempotencyKey.operation, idempotencyKey.key],
      })
      .returning({ id: idempotencyKey.id });

    if (inserted.length) return this.claimed(inserted[0]!.id);

    // key exists — inspect it
    const [existing] = await this.db
      .select()
      .from(idempotencyKey)
      .where(
        and(
          eq(idempotencyKey.actorKey, input.actorKey),
          eq(idempotencyKey.operation, input.operation),
          eq(idempotencyKey.key, input.key),
        ),
      )
      .limit(1);

    if (!existing) {
      // race lost then row vanished (expired reap) — retry once by proceeding
      return this.begin(input);
    }

    if (existing.requestFingerprint !== fp) {
      throw new AppError('idempotency_key_mismatch', {
        title: 'This Idempotency-Key was already used with a different request',
      });
    }

    if (input.retryFailed && (await this.reclaim(existing.id))) return this.claimed(existing.id);

    if (existing.status === 'in_progress') {
      // concurrent duplicate still running
      throw new AppError('duplicate_request', {
        title: 'An identical request is already being processed',
        existingResultRef: existing.resultRef ?? undefined,
      });
    }

    return {
      status: 'replay',
      responseStatus: existing.responseStatus ?? 200,
      responseBody: existing.responseBody ?? null,
    };
  }

  private claimed(id: string): IdempotencyMiss {
    return {
      status: 'proceed',
      finalize: async (responseStatus, responseBody, resultRef) => {
        await this.db
          .update(idempotencyKey)
          .set({
            status: responseStatus < 400 ? 'completed' : 'failed',
            responseStatus,
            responseBody: (responseBody ?? null) as Record<string, unknown>,
            resultRef,
            updatedAt: sql`now()`,
          })
          .where(eq(idempotencyKey.id, id));
      },
    };
  }

  /** Take over a failed (or abandoned) claim. One statement, so of several concurrent retries only
   *  one matches the row; the rest see it `in_progress` again and are refused as duplicates. */
  private async reclaim(id: string): Promise<boolean> {
    const rows = await this.db
      .update(idempotencyKey)
      .set({
        status: 'in_progress',
        responseStatus: null,
        responseBody: null,
        resultRef: null,
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(idempotencyKey.id, id),
          or(
            eq(idempotencyKey.status, 'failed'),
            and(
              eq(idempotencyKey.status, 'in_progress'),
              sql`${idempotencyKey.updatedAt} < now() - make_interval(secs => ${CLAIM_LEASE_SEC})`,
            ),
          ),
        ),
      )
      .returning({ id: idempotencyKey.id });
    return rows.length > 0;
  }
}
