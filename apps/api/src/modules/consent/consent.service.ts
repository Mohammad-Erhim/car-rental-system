import {
  CONSENT_POLICY_VERSION,
  type ConsentLogEntry,
  type ConsentLogResponse,
  type ConsentSubmitRequest,
  type ConsentSubmitResponse,
} from '@carrental/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { decodeAuditCursor, encodeAuditCursor } from '../../common/audit/audit-cursor';
import { AuditService } from '../../common/audit/audit.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { auditEvent } from '../../database/schema/platform';

const CONSENT_ACTION = 'privacy.consent.captured';

/** Reduce an IP to a coarse prefix so the audit note keeps locality without storing the address. */
function ipPrefix(ip: string | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.split('.').slice(0, 3).join('.') + '.0/24';
  if (v4.includes(':')) return v4.split(':').slice(0, 4).join(':') + '::/64';
  return null;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly audit: AuditService,
    @Inject(DB) private readonly db: Database,
  ) {}

  async record(
    body: ConsentSubmitRequest,
    meta: { ip?: string; userAgent?: string },
  ): Promise<ConsentSubmitResponse> {
    const staleVersion = body.policyVersion !== CONSENT_POLICY_VERSION;
    await this.audit.record({
      action: CONSENT_ACTION,
      targetType: 'consent',
      targetId: body.anonymousId,
      surface: 'app-cweb',
      after: {
        action: body.action,
        choices: body.choices,
        policyVersion: body.policyVersion,
        currentPolicyVersion: CONSENT_POLICY_VERSION,
        staleVersion,
        locale: body.locale,
        page: body.page ?? null,
        ipPrefix: ipPrefix(meta.ip),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { recorded: true, policyVersion: CONSENT_POLICY_VERSION };
  }

  /**
   * Consent log for ops — reads the append-only audit trail (GDPR Art. 7 accountability).
   * `entries`/`summary` must stay correct at any table size: this is a compliance report, not a
   * best-effort dashboard widget, so both the paging and the aggregate stats (total/byAction/
   * optInPct) are computed in SQL over the *entire* matching set — never loaded into memory and
   * truncated — otherwise an org with a long-lived site would get silently wrong GDPR numbers
   * once past whatever row cap a naive implementation picked.
   *
   * Keyset (cursor), not offset, for the same reason as `report.service.ts#auditLog` (same table,
   * same cost profile — `OFFSET` walks and discards every row before the page): a compliance log
   * only gets longer over time, so a page that gets slower the deeper an auditor pages into it is
   * exactly the wrong direction for this screen's purpose.
   */
  async log(query: {
    from?: string;
    to?: string;
    action?: string;
    anonymousId?: string;
    limit: number;
    cursor?: string;
  }): Promise<ConsentLogResponse> {
    const filters = [eq(auditEvent.action, CONSENT_ACTION)];
    if (query.from) filters.push(gte(auditEvent.occurredAt, query.from));
    if (query.to) filters.push(lte(auditEvent.occurredAt, query.to));
    // Pushed into SQL (not filtered post-fetch) so it composes correctly with paging and with
    // the aggregate query below — both then see exactly the same matching row set.
    if (query.action) filters.push(sql`${auditEvent.afterSafe}->>'action' = ${query.action}`);
    if (query.anonymousId) filters.push(eq(auditEvent.targetId, query.anonymousId));
    const where = and(...filters);

    const optIn = (key: 'functional' | 'analytics' | 'marketing') =>
      sql<number>`(count(*) filter (where (${auditEvent.afterSafe}->'choices'->>${key})::boolean is true))::int`;

    const cursor = query.cursor ? decodeAuditCursor(query.cursor) : null;
    const pageWhere = cursor
      ? and(
          where,
          sql`(${auditEvent.occurredAt}, ${auditEvent.seq}) < (${cursor.occurredAt}, ${cursor.seq})`,
        )
      : where;

    const [[agg], rows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          acceptAll: sql<number>`(count(*) filter (where ${auditEvent.afterSafe}->>'action' = 'accept_all'))::int`,
          rejectAll: sql<number>`(count(*) filter (where ${auditEvent.afterSafe}->>'action' = 'reject_all'))::int`,
          savePreferences: sql<number>`(count(*) filter (where ${auditEvent.afterSafe}->>'action' = 'save_preferences'))::int`,
          withdraw: sql<number>`(count(*) filter (where ${auditEvent.afterSafe}->>'action' = 'withdraw'))::int`,
          functional: optIn('functional'),
          analytics: optIn('analytics'),
          marketing: optIn('marketing'),
        })
        .from(auditEvent)
        .where(where),
      // fetch one extra row — cheaply tells us whether a next page exists without a second COUNT
      this.db
        .select({
          id: auditEvent.id,
          seq: auditEvent.seq,
          at: auditEvent.occurredAt,
          anonymousId: auditEvent.targetId,
          after: auditEvent.afterSafe,
        })
        .from(auditEvent)
        .where(pageWhere)
        .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.seq))
        .limit(query.limit + 1),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow ? encodeAuditCursor(lastRow.at, lastRow.seq) : null;

    const entries: ConsentLogEntry[] = page.map((r) => {
      const a = (r.after ?? {}) as Record<string, unknown>;
      const choices = (a.choices ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        at: r.at,
        anonymousId: r.anonymousId,
        action: (a.action as ConsentLogEntry['action']) ?? 'save_preferences',
        choices: {
          necessary: true,
          functional: choices.functional === true,
          analytics: choices.analytics === true,
          marketing: choices.marketing === true,
        },
        policyVersion: Number(a.policyVersion ?? 0),
        staleVersion: a.staleVersion === true,
        locale: String(a.locale ?? ''),
        page: (a.page as string | null) ?? null,
        ipPrefix: (a.ipPrefix as string | null) ?? null,
      };
    });

    const total = agg?.total ?? 0;
    const byAction: Record<string, number> = {};
    if (agg?.acceptAll) byAction.accept_all = agg.acceptAll;
    if (agg?.rejectAll) byAction.reject_all = agg.rejectAll;
    if (agg?.savePreferences) byAction.save_preferences = agg.savePreferences;
    if (agg?.withdraw) byAction.withdraw = agg.withdraw;
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

    return {
      entries,
      total,
      nextCursor,
      summary: {
        total,
        byAction,
        optInPct: {
          functional: pct(agg?.functional ?? 0),
          analytics: pct(agg?.analytics ?? 0),
          marketing: pct(agg?.marketing ?? 0),
        },
        from: query.from ?? null,
        to: query.to ?? null,
      },
    };
  }
}
