import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account } from '../../database/schema/iam';
import { notification } from '../../database/schema/notify';

import type { StaffPerson } from './workflow-actors.service';
import { WorkflowMessenger } from './workflow-messenger';

export interface Notice {
  kind: 'assigned' | 'reminder' | 'escalated' | 'closed' | 'message';
  /** for `closed` notices: how it ended */
  status?: string;
  recipients: StaffPerson[];
  /** recipients known only by account id (e.g. the requester) */
  recipientAccountIds?: string[];
  title: string;
  body: string;
  instanceId: string;
  taskId?: string;
}

const EVENT: Record<Notice['kind'], string> = {
  assigned: 'workflow.task.assigned',
  reminder: 'workflow.task.reminder',
  escalated: 'workflow.task.escalated',
  closed: 'workflow.request.closed',
  message: 'workflow.message',
};

/**
 * Email side of the inbox (the in-app side is the task list itself). Runs only after the change
 * that caused it has committed, and a delivery failure never affects the workflow.
 */
@Injectable()
export class WorkflowNotifier {
  private readonly logger = new Logger('WorkflowNotifier');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Resolved lazily: the notification system itself depends on workflows (for its governed publish
   * action), so injecting it here would make the two wait on each other at start-up.
   */
  private messenger(): WorkflowMessenger | null {
    try {
      return this.moduleRef.get(WorkflowMessenger, { strict: false });
    } catch {
      return null;
    }
  }

  async deliver(notices: Notice[]): Promise<void> {
    const messenger = this.messenger();
    if (!messenger) return;
    for (const n of notices) {
      try {
        const people = [...n.recipients];
        if (n.recipientAccountIds?.length) {
          const rows = await this.db
            .select({
              accountId: account.id,
              displayName: account.displayName,
              email: account.email,
              localeCode: account.localeCode,
            })
            .from(account)
            .where(inArray(account.id, n.recipientAccountIds));
          for (const r of rows) {
            people.push({ ...r, staffProfileId: '', locationScope: [] });
          }
        }
        const seen = new Set<string>();
        for (const p of people) {
          if (seen.has(p.accountId)) continue;
          seen.add(p.accountId);
          if (await this.alreadySent(n, p.accountId)) continue;
          await messenger.sendMessage({
            event: EVENT[n.kind],
            recipient: p.email,
            recipientRef: p.accountId,
            localeCode: p.localeCode,
            title: n.title,
            body: n.body,
            sourceType: 'workflow_instance',
            sourceId: n.instanceId,
          });
        }
      } catch (err) {
        this.logger.warn(`notification "${n.kind}" failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * The same message to the same person about the same request within a few minutes is sent once
   * (a retried transaction, two paths that both notice the same thing) — never a flood. Reminders are
   * spaced by hours, so they are never caught by this.
   */
  private async alreadySent(n: Notice, accountId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.event, EVENT[n.kind]),
          eq(notification.recipientRef, accountId),
          eq(notification.sourceId, n.instanceId),
          gt(notification.createdAt, sql`now() - interval '10 minutes'`),
          sql`${notification.variables}->>'title' = ${n.title}`,
          sql`${notification.variables}->>'body' = ${n.body}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
