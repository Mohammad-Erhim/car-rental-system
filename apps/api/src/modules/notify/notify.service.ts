import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getCorrelation } from '../../common/correlation';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { notification, template } from '../../database/schema/notify';

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
  ) {}

  async send(input: SendInput): Promise<{ id: string }> {
    const channel = input.channel ?? 'email';
    const locale = input.localeCode ?? 'en';
    const vars = input.variables ?? {};

    let subject = input.fallback?.subject ?? null;
    let body = input.fallback?.body ?? '';
    let templateKey: string | null = null;
    let templateVersion: string | null = null;

    const [tpl] = await this.db
      .select()
      .from(template)
      .where(
        and(
          eq(template.key, input.event),
          eq(template.channel, channel),
          eq(template.localeCode, locale),
          eq(template.status, 'published'),
        ),
      )
      .orderBy(desc(template.publishedAt))
      .limit(1);

    if (tpl) {
      templateKey = tpl.key;
      templateVersion = tpl.version;
      subject = render(tpl.subject ?? '', vars) || subject;
      body = render(tpl.bodyTemplate, vars);
    } else if (!body) {
      body = `[${input.event}] ` + JSON.stringify(vars);
    }

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
        variables: vars,
        deliveryState: 'queued',
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        traceId: getCorrelation()?.traceId ?? null,
      })
      .returning({ id: notification.id });

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
