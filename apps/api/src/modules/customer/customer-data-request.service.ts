import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer, privacyRequest } from '../../database/schema/customer';
import { account } from '../../database/schema/iam';
import { NotifyService } from '../notify/notify.service';

const TERMINAL = ['completed', 'rejected', 'cancelled'];

/**
 * FR-IAM-008 (staff side) — review, complete or reject a customer's access / correction /
 * closure request. Direct staff action, no approval pipeline: `resolution_note` / `resolved_by`
 * / `resolved_at` are pre-existing columns that nothing wrote to until now. Completing a
 * `closure` request only records the decision — nothing in this codebase deactivates an
 * account yet, so that stays a separate, deliberate staff action outside this flow.
 */
@Injectable()
export class CustomerDataRequestService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  private async accountIdFor(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ accountId: customer.accountId })
      .from(customer)
      .where(eq(customer.id, customerId))
      .limit(1);
    if (!row) throw AppError.notFound('customer');
    return row.accountId;
  }

  private async load(accountId: string | null, id: string) {
    if (!accountId) throw AppError.notFound('privacy request');
    const [row] = await this.db
      .select()
      .from(privacyRequest)
      .where(and(eq(privacyRequest.id, id), eq(privacyRequest.accountId, accountId)))
      .limit(1);
    if (!row) throw AppError.notFound('privacy request');
    return row;
  }

  async list(customerId: string) {
    const accountId = await this.accountIdFor(customerId);
    if (!accountId) return [];
    const rows = await this.db
      .select()
      .from(privacyRequest)
      .where(eq(privacyRequest.accountId, accountId))
      .orderBy(desc(privacyRequest.createdAt));
    return rows.map((r) => this.shape(r));
  }

  async review(actor: Actor, customerId: string, id: string, notes?: string) {
    const accountId = await this.accountIdFor(customerId);
    const row = await this.load(accountId, id);
    if (!['received', 'blocked'].includes(row.status)) {
      throw AppError.businessRule(`A ${row.status} request cannot be marked in review`, {
        reason: 'privacy_request_not_reviewable',
      });
    }
    const [updated] = await this.db
      .update(privacyRequest)
      .set({ status: 'in_review', updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
      .where(eq(privacyRequest.id, id))
      .returning();
    await this.audit.record({
      action: 'customer.privacy_request.reviewed',
      targetType: 'privacy_request',
      targetId: id,
      actor,
      after: { customerId, notes },
    });
    return this.shape(updated!);
  }

  async complete(actor: Actor, customerId: string, id: string, notes?: string) {
    return this.resolve(actor, customerId, id, 'completed', notes);
  }

  async reject(actor: Actor, customerId: string, id: string, notes?: string) {
    return this.resolve(actor, customerId, id, 'rejected', notes);
  }

  private async resolve(
    actor: Actor,
    customerId: string,
    id: string,
    status: 'completed' | 'rejected',
    notes?: string,
  ) {
    const accountId = await this.accountIdFor(customerId);
    const row = await this.load(accountId, id);
    if (TERMINAL.includes(row.status)) {
      throw AppError.businessRule(`A ${row.status} request cannot be ${status}`, {
        reason: 'privacy_request_already_final',
      });
    }
    const [updated] = await this.db
      .update(privacyRequest)
      .set({
        status,
        resolutionNote: notes ?? null,
        resolvedBy: actor.accountId,
        resolvedAt: new Date().toISOString(),
        updatedBy: actor.accountId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(privacyRequest.id, id))
      .returning();
    await this.audit.record({
      action: `customer.privacy_request.${status}`,
      targetType: 'privacy_request',
      targetId: id,
      actor,
      after: { customerId, notes },
    });
    void this.notifySafe(id, row.accountId, row.kind, status, notes);
    return this.shape(updated!);
  }

  /** Best-effort — a delivery failure must never undo the staff decision that was just recorded. */
  private async notifySafe(
    id: string,
    accountId: string,
    kind: string,
    status: 'completed' | 'rejected',
    notes?: string,
  ) {
    const [acc] = await this.db
      .select({ email: account.email, localeCode: account.localeCode })
      .from(account)
      .where(eq(account.id, accountId))
      .limit(1);
    if (!acc?.email) return;
    const localeCode = acc.localeCode ?? 'en';
    const fallbackByLocale: Record<string, { subject: string; body: string }> = {
      en: {
        subject:
          status === 'completed' ? 'Your data request is complete' : 'About your data request',
        body:
          status === 'completed'
            ? `Your ${kind} request has been completed.${notes ? ` Note: ${notes}` : ''}`
            : `Your ${kind} request was not approved.${notes ? ` Reason: ${notes}` : ''}`,
      },
      fr: {
        subject:
          status === 'completed'
            ? 'Votre demande de données est traitée'
            : 'À propos de votre demande de données',
        body:
          status === 'completed'
            ? `Votre demande de ${kind} a été traitée.${notes ? ` Remarque : ${notes}` : ''}`
            : `Votre demande de ${kind} n’a pas été acceptée.${notes ? ` Motif : ${notes}` : ''}`,
      },
      ar: {
        subject: status === 'completed' ? 'اكتمل طلب بياناتك' : 'بخصوص طلب بياناتك',
        body:
          status === 'completed'
            ? `تم إنجاز طلب ${kind} الخاص بك.${notes ? ` ملاحظة: ${notes}` : ''}`
            : `لم تتم الموافقة على طلب ${kind} الخاص بك.${notes ? ` السبب: ${notes}` : ''}`,
      },
    };
    try {
      await this.notify.send({
        event: 'privacy_request_resolved',
        channel: 'email',
        recipient: acc.email,
        recipientRef: accountId,
        localeCode,
        sourceType: 'privacy_request',
        sourceId: id,
        variables: { kind, status },
        fallback: fallbackByLocale[localeCode] ?? fallbackByLocale.en,
      });
    } catch {
      /* non-fatal */
    }
  }

  private shape(r: typeof privacyRequest.$inferSelect) {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      blockers: r.blockers,
      detail: r.detail,
      resolutionNote: r.resolutionNote,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    };
  }
}
