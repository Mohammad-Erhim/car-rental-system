import {
  CONSENT_POLICY_VERSION,
  type ConsentLogEntry,
  type ConsentLogResponse,
  type ConsentSubmitRequest,
  type ConsentSubmitResponse,
} from '@carrental/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { AuditService } from '../../common/audit/audit.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { auditEvent } from '../../database/schema/platform';

const CONSENT_ACTION = 'privacy.consent.captured';
const SCAN_CAP = 5000;

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

  /** Consent log for ops — reads the append-only audit trail. */
  async log(query: {
    from?: string;
    to?: string;
    action?: string;
    limit: number;
    offset: number;
  }): Promise<ConsentLogResponse> {
    const filters = [eq(auditEvent.action, CONSENT_ACTION)];
    if (query.from) filters.push(gte(auditEvent.occurredAt, query.from));
    if (query.to) filters.push(lte(auditEvent.occurredAt, query.to));

    const rows = await this.db
      .select({
        id: auditEvent.id,
        at: auditEvent.occurredAt,
        anonymousId: auditEvent.targetId,
        after: auditEvent.afterSafe,
      })
      .from(auditEvent)
      .where(and(...filters))
      .orderBy(desc(auditEvent.occurredAt))
      .limit(SCAN_CAP);

    const mapped: ConsentLogEntry[] = rows.map((r) => {
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

    const filtered = query.action ? mapped.filter((e) => e.action === query.action) : mapped;

    const byAction: Record<string, number> = {};
    for (const e of filtered) byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    const pct = (key: 'functional' | 'analytics' | 'marketing') =>
      filtered.length
        ? Math.round((filtered.filter((e) => e.choices[key]).length / filtered.length) * 1000) / 10
        : 0;

    return {
      entries: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      summary: {
        total: filtered.length,
        byAction,
        optInPct: {
          functional: pct('functional'),
          analytics: pct('analytics'),
          marketing: pct('marketing'),
        },
        from: query.from ?? null,
        to: query.to ?? null,
      },
    };
  }
}
