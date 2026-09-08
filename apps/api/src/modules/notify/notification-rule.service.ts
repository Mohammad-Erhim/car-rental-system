import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { notificationRule, template } from '../../database/schema/notify';

/**
 * FR-ADM-011 event-rules half — the *when / to whom / how* of a transactional message, kept
 * separate from the localized content the template editor owns. One rule per (event, channel);
 * `resolve()` returns the effective rule (saved or the built-in default) and is consulted by
 * `NotifyService.send()`. Timing (delay / quiet hours) + escalation are stored and surfaced; a
 * scheduler enforcing them is a documented follow-up — the `enabled` gate and `senderIdentity`
 * are applied on send today.
 */
export type Audience = 'primary_renter' | 'account_holder' | 'all_drivers' | 'ops';

export interface RuleInput {
  event: string;
  channel?: string;
  enabled?: boolean;
  audience?: Audience;
  delayMinutes?: number;
  quietHours?: { start: string; end: string } | null;
  maxAttempts?: number;
  retryBackoffMinutes?: number;
  escalateAfterAttempts?: number | null;
  senderIdentity?: string | null;
}

export interface EffectiveRule {
  event: string;
  channel: string;
  enabled: boolean;
  audience: Audience;
  delayMinutes: number;
  quietHours: { start: string; end: string } | null;
  maxAttempts: number;
  retryBackoffMinutes: number;
  escalateAfterAttempts: number | null;
  senderIdentity: string | null;
  isDefault: boolean;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function defaultRule(event: string, channel: string): EffectiveRule {
  return {
    event,
    channel,
    enabled: true,
    audience: 'primary_renter',
    delayMinutes: 0,
    quietHours: null,
    maxAttempts: 3,
    retryBackoffMinutes: 15,
    escalateAfterAttempts: null,
    senderIdentity: null,
    isDefault: true,
  };
}

@Injectable()
export class NotificationRuleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Every event that has a template, with its effective rule (saved or default). */
  async list() {
    const keys = await this.db
      .selectDistinct({ key: template.key, channel: template.channel })
      .from(template)
      .orderBy(asc(template.key), asc(template.channel));
    const saved = await this.db.select().from(notificationRule);
    const savedMap = new Map(saved.map((r) => [`${r.event}:${r.channel}`, r]));

    const seen = new Set<string>();
    const out: EffectiveRule[] = [];
    for (const k of keys) {
      const id = `${k.key}:${k.channel}`;
      seen.add(id);
      const row = savedMap.get(id);
      out.push(row ? this.shape(row) : defaultRule(k.key, k.channel));
    }
    // rules for events with no template row (kept for completeness)
    for (const r of saved) {
      if (!seen.has(`${r.event}:${r.channel}`)) out.push(this.shape(r));
    }
    return out;
  }

  async get(event: string, channel = 'email'): Promise<EffectiveRule> {
    const [row] = await this.db
      .select()
      .from(notificationRule)
      .where(and(eq(notificationRule.event, event), eq(notificationRule.channel, channel)))
      .limit(1);
    return row ? this.shape(row) : defaultRule(event, channel);
  }

  /** Effective rule for the dispatcher — same as `get`, kept as a stable name for callers. */
  resolve(event: string, channel = 'email'): Promise<EffectiveRule> {
    return this.get(event, channel);
  }

  async upsert(actor: Actor, input: RuleInput): Promise<EffectiveRule> {
    const channel = input.channel ?? 'email';
    if (input.quietHours) {
      const { start, end } = input.quietHours;
      if (!HHMM.test(start) || !HHMM.test(end)) {
        throw AppError.validation([{ path: 'quietHours', code: 'invalid_string' }]);
      }
    }
    for (const [k, v] of Object.entries({
      delayMinutes: input.delayMinutes,
      maxAttempts: input.maxAttempts,
      retryBackoffMinutes: input.retryBackoffMinutes,
    })) {
      if (v != null && (v < 0 || v > 100_000)) {
        throw AppError.validation([{ path: k, code: 'out_of_range' }]);
      }
    }

    const [existing] = await this.db
      .select()
      .from(notificationRule)
      .where(and(eq(notificationRule.event, input.event), eq(notificationRule.channel, channel)))
      .limit(1);

    const values = {
      enabled: input.enabled ?? existing?.enabled ?? true,
      audience: input.audience ?? (existing?.audience as Audience) ?? 'primary_renter',
      delayMinutes: input.delayMinutes ?? existing?.delayMinutes ?? 0,
      quietHours:
        input.quietHours === undefined ? (existing?.quietHours ?? null) : input.quietHours,
      maxAttempts: input.maxAttempts ?? existing?.maxAttempts ?? 3,
      retryBackoffMinutes: input.retryBackoffMinutes ?? existing?.retryBackoffMinutes ?? 15,
      escalateAfterAttempts:
        input.escalateAfterAttempts === undefined
          ? (existing?.escalateAfterAttempts ?? null)
          : input.escalateAfterAttempts,
      senderIdentity:
        input.senderIdentity === undefined
          ? (existing?.senderIdentity ?? null)
          : input.senderIdentity,
    };

    const [row] = existing
      ? await this.db
          .update(notificationRule)
          .set({ ...values, updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
          .where(eq(notificationRule.id, existing.id))
          .returning()
      : await this.db
          .insert(notificationRule)
          .values({ event: input.event, channel, createdBy: actor.accountId, ...values })
          .returning();

    await this.audit.record({
      action: existing ? 'notify.rule.updated' : 'notify.rule.created',
      targetType: 'notification_rule',
      targetId: row!.id,
      actor,
      after: { event: input.event, channel, enabled: values.enabled },
    });
    return this.shape(row!);
  }

  async setEnabled(actor: Actor, event: string, channel: string, enabled: boolean) {
    return this.upsert(actor, { event, channel, enabled });
  }

  private shape(r: typeof notificationRule.$inferSelect): EffectiveRule {
    return {
      event: r.event,
      channel: r.channel,
      enabled: r.enabled,
      audience: r.audience as Audience,
      delayMinutes: r.delayMinutes,
      quietHours: r.quietHours ?? null,
      maxAttempts: r.maxAttempts,
      retryBackoffMinutes: r.retryBackoffMinutes,
      escalateAfterAttempts: r.escalateAfterAttempts ?? null,
      senderIdentity: r.senderIdentity ?? null,
      isDefault: false,
    };
  }
}
