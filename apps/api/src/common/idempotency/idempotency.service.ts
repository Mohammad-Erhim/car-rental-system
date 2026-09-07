import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

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

  async begin(input: {
    actorKey: string;
    operation: string;
    key: string;
    body: unknown;
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

    if (inserted.length) {
      const id = inserted[0]!.id;
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
}
