import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getCorrelation } from '../../common/correlation';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { notification, template } from '../../database/schema/notify';
import { LocaleRepo } from '../config/locale.repo';

import { NotificationRuleService } from './notification-rule.service';
import { renderTemplate } from './render';

export interface AudienceRecipient {
  email: string;
  ref?: string;
}

/**
 * FR-ADM-011 audience routing — the caller's best resolution of each possible audience the event
 * rule might be configured for, keyed by `NotificationRuleService`'s `Audience` values. `send()`
 * picks the entry matching the rule's *configured* audience, falling back to the plain
 * `recipient`/`recipientRef` on `SendInput` when that entry is missing (an unresolvable audience,
 * e.g. no pickup-location contact on file, must never silently drop the message).
 */
export interface AudienceRecipients {
  primary_renter?: AudienceRecipient;
  account_holder?: AudienceRecipient;
  /** every driver on the booking — `all_drivers` fans out to one notification row each. */
  all_drivers?: AudienceRecipient[];
  ops?: AudienceRecipient;
}

export interface SendInput {
  event: string; // notification_event code
  channel?: 'email' | 'sms' | 'push';
  /** default/fallback recipient — see `audience` below. */
  recipient: string;
  recipientRef?: string;
  audience?: AudienceRecipients;
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
    private readonly locales: LocaleRepo,
  ) {}

  async send(input: SendInput): Promise<{ ids: string[] }> {
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
    const chain = await this.locales.fallbackChain(locale);
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
      // Escape interpolated values for 'email' (a real HTML mail transport would render `body`
      // as markup — a customer-controlled value like a registered full name must not become
      // live HTML) — never for 'sms'/'push', which are always plain text and must not show
      // literal "&amp;"/"&#39;" to the recipient.
      const escape = channel === 'email';
      subject = renderTemplate(tpl.subject ?? '', vars, { escape }) || subject;
      body = renderTemplate(tpl.bodyTemplate, vars, { escape });
    } else if (!body) {
      body = `[${input.event}] ` + JSON.stringify(vars);
    }

    // FR-ADM-011 event rule — a disabled rule suppresses the send; the sender identity is
    // stamped; the configured *audience* determines who actually gets this send.
    const rule = await this.rules.resolve(input.event, channel);
    const targets = this.resolveTargets(rule.audience, input);

    const ids: string[] = [];
    for (const target of targets) {
      const [row] = await this.db
        .insert(notification)
        .values({
          event: input.event,
          channel,
          recipient: target.recipient,
          recipientRef: target.recipientRef ?? null,
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
      ids.push(row!.id);

      if (!rule.enabled) {
        this.logger.log(
          { event: input.event, channel, id: row!.id },
          'notification suppressed by event rule',
        );
        continue;
      }

      // Local driver: no real carrier. The worker relays; for immediate dev feedback, mark sent.
      if (this.env.MAIL_DRIVER === 'outbox') {
        await this.db
          .update(notification)
          .set({ deliveryState: 'sent', sentAt: sql`now()`, attempts: 1, updatedAt: sql`now()` })
          .where(eq(notification.id, row!.id));
        this.logger.log(
          { event: input.event, channel, recipient: maskRecipient(target.recipient), id: row!.id },
          'notification queued (outbox driver)',
        );
      }
    }

    return { ids };
  }

  /** One row per actual recipient for the rule's configured audience; `all_drivers` may fan out
   *  to several. Falls back to `input.recipient` when the audience has no resolvable entry, so a
   *  routing gap (e.g. no pickup-location contact on file for `ops`) never silently drops the
   *  notification instead of just narrowing who gets it. */
  private resolveTargets(
    audience: string,
    input: SendInput,
  ): Array<{ recipient: string; recipientRef?: string }> {
    const fallback = { recipient: input.recipient, recipientRef: input.recipientRef };
    const a = input.audience;
    if (audience === 'all_drivers') {
      if (!a?.all_drivers?.length) return [fallback];
      return a.all_drivers.map((d) => ({ recipient: d.email, recipientRef: d.ref }));
    }
    const one =
      audience === 'account_holder'
        ? a?.account_holder
        : audience === 'ops'
          ? a?.ops
          : a?.primary_renter;
    return [one ? { recipient: one.email, recipientRef: one.ref } : fallback];
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

function maskRecipient(r: string): string {
  if (r.includes('@')) {
    const [u = '', d = ''] = r.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  return r.slice(0, 3) + '***';
}
