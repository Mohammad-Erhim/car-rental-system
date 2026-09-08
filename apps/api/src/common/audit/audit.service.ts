import { Inject, Injectable } from '@nestjs/common';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { auditEvent } from '../../database/schema/platform';
import type { Actor } from '../auth/types';
import { getCorrelation } from '../correlation';

/** Fields masked in audit before/after diffs (SRS-SEC-017, SRS-DAT-008). */
const SENSITIVE_KEYS =
  /password|secret|token|pepper|licence(Number)?|licenseNumber|cvv|pan|cardNumber|ssn|dob|dateOfBirth/i;

function mask(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => mask(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[masked]' : mask(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string; // e.g. 'iam.account.recovered'
  targetType: string;
  targetId?: string;
  outcome?: 'accepted' | 'rejected' | 'failed';
  reason?: string;
  before?: unknown;
  after?: unknown;
  actor?: Actor | { accountId?: string; kind?: string; displayName?: string } | null;
  surface?: string;
  organizationId?: string;
}

/**
 * Append-only audit trail (FR-GBL-008, SRS-SEC-016). Records who/what, prior/resulting state
 * (masked), a reason for sensitive actions, and the request trace lineage.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(input: AuditInput): Promise<void> {
    const ctx = getCorrelation();
    const actor = input.actor;
    await this.db.insert(auditEvent).values({
      actorType: (actor && 'kind' in actor && actor.kind) || 'system',
      actorId: (actor && 'accountId' in actor && actor.accountId) || null,
      actorLabel: (actor && 'displayName' in actor && actor.displayName) || null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      outcome: input.outcome ?? 'accepted',
      reason: input.reason ?? null,
      beforeSafe:
        input.before !== undefined ? (mask(input.before) as Record<string, unknown>) : null,
      afterSafe: input.after !== undefined ? (mask(input.after) as Record<string, unknown>) : null,
      surface: input.surface ?? ctx?.actorType ?? null,
      traceId: ctx?.traceId ?? null,
      requestId: ctx?.requestId ?? null,
      organizationId: input.organizationId ?? null,
    });
  }
}
