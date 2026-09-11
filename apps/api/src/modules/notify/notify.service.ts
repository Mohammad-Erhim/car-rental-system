import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getCorrelation } from '../../common/correlation';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale as localeTable } from '../../database/schema/i18n';
import { notification, template } from '../../database/schema/notify';

import { NotificationRuleService } from './notification-rule.service';

export interface SendInput {
  event: string; // notification_event code
  channel?: 'email' | 'sms' | 'push';
  recipient: string;
  recipientRef?: string;
  localeCode?: string;
  variables?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  /** inline fallback body when no published template exists (system/bootstrap messages) */
  fallback?: { subject?: string; body: string };
}

/**
 * Notification port + local outbox driver (DEC-016, FR-INT-002). `send()` renders a published
 * template (or the inline fallback) and persists the message; the worker transitions it to
 * `sent`. Delivery failure never changes the domain action.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger('NotifyService');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly rules: NotificationRuleService,
  ) {}

  async send(input: SendInput): Promise<{ id: string }> {
    const channel = input.channel ?? 'email';
    const locale = input.localeCode ?? 'en';
    const vars = input.variables ?? {};

    let subject = input.fallback?.subject ?? null;
    let body = input.fallback?.body ?? '';
    let templateKey: string | null = null;
    let templateVersion: string | null = null;

    // Walk the *runtime* fallback chain (locale.fallback_chain, DEC-024) — a customer on a
    // locale whose template hasn't been translated yet still gets real, reviewed copy (in the
    // chain's next language) instead of the raw-JSON last-resort below.
    const chain = await this.localeFallbackChain(locale);
    let tpl: typeof template.$inferSelect | undefined;
    for (const loc of chain) {
      [tpl] = await this.db
        .select()
        .from(template)
        .where(
          and(
            eq(template.key, input.event),
            eq(template.channel, channel),
            eq(template.localeCode, loc),
            eq(template.status, 'published'),
          ),
        )
        .orderBy(desc(template.publishedAt))
        .limit(1);
      if (tpl) break;
    }

    if (tpl) {
      templateKey = tpl.key;
      templateVersion = tpl.version;
      subject = render(tpl.subject ?? '', vars) || subject;
      body = render(tpl.bodyTemplate, vars);
    } else if (!body) {
      body = `[${input.event}] ` + JSON.stringify(vars);
    }

    // FR-ADM-011 event rule — a disabled rule suppresses the send; the sender identity is stamped.
    const rule = await this.rules.resolve(input.event, channel);

    const [row] = await this.db
      .insert(notification)
      .values({
        event: input.event,
        channel,
        recipient: input.recipient,
        recipientRef: input.recipientRef ?? null,
        localeCode: locale,
        templateKey,
        templateVersion,
        subject,
        body,
        sender: rule.senderIdentity,
        variables: vars,
        deliveryState: rule.enabled ? 'queued' : 'suppressed',
        lastError: rule.enabled ? null : 'rule_disabled',
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        traceId: getCorrelation()?.traceId ?? null,
      })
      .returning({ id: notification.id });

    if (!rule.enabled) {
      this.logger.log(
        { event: input.event, channel, id: row!.id },
        'notification suppressed by event rule',
      );
      return { id: row!.id };
    }

    // Local driver: no real carrier. The worker relays; for immediate dev feedback, mark sent.
    if (this.env.MAIL_DRIVER === 'outbox') {
      await this.db
        .update(notification)
        .set({ deliveryState: 'sent', sentAt: sql`now()`, attempts: 1, updatedAt: sql`now()` })
        .where(eq(notification.id, row!.id));
      this.logger.log(
        { event: input.event, channel, recipient: maskRecipient(input.recipient), id: row!.id },
        'notification queued (outbox driver)',
      );
    }

    return { id: row!.id };
  }

  /** `[code, ...its fallback chain, the runtime default]`, deduped — mirrors how the rest of the
   *  i18n system resolves a locale that lacks content (DEC-024). Falls back to `[code, 'en']`
   *  if the locale table is empty/unreachable, so a send never hard-fails on this lookup. */
  private async localeFallbackChain(code: string): Promise<string[]> {
    const rows = await this.db.select().from(localeTable).where(eq(localeTable.isActive, true));
    const def = rows.find((r) => r.code === code) ?? rows.find((r) => r.isDefault);
    const defaultCode = rows.find((r) => r.isDefault)?.code ?? 'en';
    if (!def) return [...new Set([code, defaultCode])];
    return [...new Set([def.code, ...def.fallbackChain, defaultCode])];
  }

  /** Dev-only: recent messages for the ops mail viewer. */
  async recent(limit = 50) {
    return this.db
      .select()
      .from(notification)
      .orderBy(desc(notification.createdAt))
      .limit(Math.min(limit, 200));
  }
}

function render(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => {
    const v = k
      .split('.')
      .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], vars);
    return v == null ? '' : String(v);
  });
}

function maskRecipient(r: string): string {
  if (r.includes('@')) {
    const [u = '', d = ''] = r.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  return r.slice(0, 3) + '***';
}
