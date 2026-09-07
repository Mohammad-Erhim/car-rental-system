import { fallbackChain } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { translation } from '../../database/schema/i18n';
import { lookupType, lookupValue } from '../../database/schema/lookup';

const NS = 'lookup';

export interface LookupQuery {
  scopeKey?: string;
  locale?: string;
  includeInactive?: boolean;
  /** resolve values active at this instant (ISO); default = now */
  activeAt?: string;
  search?: string;
}

@Injectable()
export class LookupService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cache: CacheBus,
  ) {}

  private async etag(typeCode: string): Promise<string> {
    const v = await this.cache.version(`${NS}:${typeCode}`);
    return `W/"lkp-${typeCode}-${v}"`;
  }

  async getType(typeCode: string) {
    const [type] = await this.db
      .select()
      .from(lookupType)
      .where(eq(lookupType.code, typeCode))
      .limit(1);
    if (!type) throw AppError.notFound('lookup type');
    const counts = await this.db
      .select({
        active: sql<number>`count(*) filter (where ${lookupValue.isActive})::int`,
        inactive: sql<number>`count(*) filter (where not ${lookupValue.isActive})::int`,
      })
      .from(lookupValue)
      .where(eq(lookupValue.typeCode, typeCode));
    return {
      code: type.code,
      classification: type.classification as
        | 'configurable'
        | 'constrained'
        | 'system_fixed'
        | 'external'
        | 'entity_owned',
      ownerModule: type.ownerModule,
      scopeModel: type.scopeModel,
      editability: type.editability as 'editable' | 'constrained' | 'read_only',
      lockReason: type.lockReason,
      consumerSurfaces: type.consumerSurfaces,
      description: type.description,
      activeValueCount: counts[0]?.active ?? 0,
      inactiveValueCount: counts[0]?.inactive ?? 0,
      lastSyncedAt: type.lastSyncedAt,
      lastSyncStatus: type.lastSyncStatus,
    };
  }

  async listTypes(filter?: { classification?: string; ownerModule?: string; search?: string }) {
    const rows = await this.db.select().from(lookupType).orderBy(asc(lookupType.code));
    const out = [];
    for (const t of rows) {
      if (filter?.classification && t.classification !== filter.classification) continue;
      if (filter?.ownerModule && t.ownerModule !== filter.ownerModule) continue;
      if (
        filter?.search &&
        !`${t.code} ${t.description ?? ''}`.toLowerCase().includes(filter.search.toLowerCase())
      )
        continue;
      out.push(await this.getType(t.code));
    }
    return out;
  }

  /** SRS-LKP-013: values with stable code separate from localized label; historical-safe. */
  async getValues(typeCode: string, q: LookupQuery = {}) {
    const type = await this.getType(typeCode);
    const scopeKey = q.scopeKey ?? 'global';
    const at = q.activeAt ? new Date(q.activeAt) : new Date();

    const rows = await this.db
      .select()
      .from(lookupValue)
      .where(
        and(
          eq(lookupValue.typeCode, typeCode),
          or(eq(lookupValue.scopeKey, scopeKey), eq(lookupValue.scopeKey, 'global')),
        ),
      )
      .orderBy(asc(lookupValue.sortOrder), asc(lookupValue.code));

    // localized labels
    const chain = fallbackChain(q.locale ?? 'en');
    const labelRows = await this.db
      .select()
      .from(translation)
      .where(
        and(
          eq(translation.namespace, `${NS}:${typeCode}`),
          inArray(translation.localeCode, chain),
          eq(translation.status, 'published'),
        ),
      );
    const labels = new Map<string, { value: string; locale: string }>();
    for (const loc of [...chain].reverse()) {
      for (const lr of labelRows.filter((r) => r.localeCode === loc)) {
        labels.set(lr.key, { value: lr.value, locale: loc });
      }
    }

    const values = rows
      .filter((r) => {
        if (q.includeInactive) return true;
        if (!r.isActive) return false;
        if (r.effectiveFrom && new Date(r.effectiveFrom) > at) return false;
        if (r.effectiveTo && new Date(r.effectiveTo) < at) return false;
        return true;
      })
      .filter((r) =>
        q.search
          ? `${r.code} ${r.defaultLabel}`.toLowerCase().includes(q.search.toLowerCase())
          : true,
      )
      .map((r) => {
        const label = labels.get(r.code);
        return {
          id: r.id,
          typeCode: r.typeCode,
          code: r.code,
          scopeKey: r.scopeKey,
          label: label?.value ?? r.defaultLabel,
          labelLocale: label?.locale,
          description: null as string | null,
          sortOrder: r.sortOrder,
          isDefault: r.isDefault,
          isActive: r.isActive,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          attributes: r.attributes,
          systemManaged: r.systemManaged,
          version: r.version,
        };
      });

    return { type, values, etag: await this.etag(typeCode) };
  }

  /** Resolve a single historical value's label even when inactive (SRS-LKP-009). */
  async resolveHistorical(typeCode: string, code: string, locale = 'en') {
    const res = await this.getValues(typeCode, { locale, includeInactive: true });
    return res.values.find((v) => v.code === code) ?? null;
  }

  // ------------------------------------------------------------------ management

  private assertEditable(type: Awaited<ReturnType<LookupService['getType']>>) {
    if (type.editability === 'read_only') {
      throw new AppError('forbidden', {
        title: type.lockReason ?? 'This reference type is read-only',
        params: { reason: 'read_only', lockReason: type.lockReason ?? '' },
      });
    }
  }

  async createValue(
    actor: Actor,
    typeCode: string,
    input: {
      code: string;
      scopeKey?: string;
      label: string;
      description?: string;
      sortOrder?: number;
      isDefault?: boolean;
      attributes?: Record<string, unknown>;
      translations?: Record<string, string>;
    },
  ) {
    const type = await this.getType(typeCode);
    this.assertEditable(type);

    const scopeKey = input.scopeKey ?? 'global';
    const [dupe] = await this.db
      .select({ id: lookupValue.id })
      .from(lookupValue)
      .where(
        and(
          eq(lookupValue.typeCode, typeCode),
          eq(lookupValue.scopeKey, scopeKey),
          eq(lookupValue.code, input.code),
        ),
      )
      .limit(1);
    if (dupe) {
      throw new AppError('state_conflict', { title: `Code "${input.code}" already exists here` });
    }

    const [row] = await this.db
      .insert(lookupValue)
      .values({
        typeCode,
        code: input.code,
        scopeKey,
        defaultLabel: input.label,
        sortOrder: input.sortOrder ?? 0,
        isDefault: input.isDefault ?? false,
        isActive: true,
        attributes: input.attributes ?? {},
        systemManaged: false,
        createdBy: actor.accountId,
      })
      .returning();

    await this.writeTranslations(
      typeCode,
      input.code,
      { en: input.label, ...(input.translations ?? {}) },
      actor,
    );
    await this.afterMutation(actor, typeCode, 'lookup.value.created', row!.id, {
      code: input.code,
    });
    return (await this.getValues(typeCode, { includeInactive: true })).values.find(
      (v) => v.id === row!.id,
    )!;
  }

  async updateValue(
    actor: Actor,
    typeCode: string,
    valueId: string,
    input: {
      label?: string;
      description?: string | null;
      sortOrder?: number;
      isDefault?: boolean;
      attributes?: Record<string, unknown>;
      translations?: Record<string, string>;
    },
    expectedVersion?: number,
  ) {
    const type = await this.getType(typeCode);
    this.assertEditable(type);
    const [row] = await this.db
      .select()
      .from(lookupValue)
      .where(and(eq(lookupValue.id, valueId), eq(lookupValue.typeCode, typeCode)))
      .limit(1);
    if (!row) throw AppError.notFound('lookup value');
    if (row.systemManaged && type.classification === 'system_fixed') {
      throw new AppError('forbidden', {
        title: 'System-managed value — only localized labels can change',
      });
    }
    if (expectedVersion !== undefined && expectedVersion !== row.version) {
      throw AppError.conflict(row.version);
    }

    if (input.isDefault) {
      await this.db
        .update(lookupValue)
        .set({ isDefault: false, updatedAt: sql`now()` })
        .where(and(eq(lookupValue.typeCode, typeCode), eq(lookupValue.scopeKey, row.scopeKey)));
    }

    await this.db
      .update(lookupValue)
      .set({
        defaultLabel: input.label ?? row.defaultLabel,
        sortOrder: input.sortOrder ?? row.sortOrder,
        isDefault: input.isDefault ?? row.isDefault,
        attributes: input.attributes ?? row.attributes,
        version: row.version + 1,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(lookupValue.id, valueId));

    if (input.label || input.translations) {
      await this.writeTranslations(
        typeCode,
        row.code,
        { ...(input.label ? { en: input.label } : {}), ...(input.translations ?? {}) },
        actor,
      );
    }

    await this.afterMutation(actor, typeCode, 'lookup.value.updated', valueId, {
      code: row.code,
      before: { label: row.defaultLabel, sortOrder: row.sortOrder },
    });
    return (await this.getValues(typeCode, { includeInactive: true })).values.find(
      (v) => v.id === valueId,
    )!;
  }

  async setActive(actor: Actor, typeCode: string, valueId: string, active: boolean) {
    const type = await this.getType(typeCode);
    this.assertEditable(type);
    const [row] = await this.db
      .select()
      .from(lookupValue)
      .where(and(eq(lookupValue.id, valueId), eq(lookupValue.typeCode, typeCode)))
      .limit(1);
    if (!row) throw AppError.notFound('lookup value');
    if (row.systemManaged) {
      throw new AppError('forbidden', { title: 'System-managed value cannot be deactivated' });
    }
    await this.db
      .update(lookupValue)
      .set({
        isActive: active,
        version: row.version + 1,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(lookupValue.id, valueId));
    await this.afterMutation(
      actor,
      typeCode,
      active ? 'lookup.value.restored' : 'lookup.value.deactivated',
      valueId,
      { code: row.code },
    );
    return { id: valueId, isActive: active };
  }

  async reorder(actor: Actor, typeCode: string, order: Array<{ id: string; sortOrder: number }>) {
    const type = await this.getType(typeCode);
    this.assertEditable(type);
    for (const o of order) {
      await this.db
        .update(lookupValue)
        .set({ sortOrder: o.sortOrder, updatedAt: sql`now()` })
        .where(and(eq(lookupValue.id, o.id), eq(lookupValue.typeCode, typeCode)));
    }
    await this.afterMutation(actor, typeCode, 'lookup.reordered', typeCode, {
      count: order.length,
    });
    return this.getValues(typeCode, { includeInactive: true });
  }

  private async writeTranslations(
    typeCode: string,
    code: string,
    labels: Record<string, string>,
    actor: Actor,
  ) {
    for (const [locale, value] of Object.entries(labels)) {
      if (!value) continue;
      await this.db
        .insert(translation)
        .values({
          namespace: `${NS}:${typeCode}`,
          key: code,
          localeCode: locale,
          value,
          status: 'published',
          sourceRevision: 'lookup-edit',
          reviewedBy: actor.accountId,
        })
        .onConflictDoUpdate({
          target: [translation.namespace, translation.key, translation.localeCode],
          set: { value, status: 'published', updatedAt: sql`now()` },
        });
    }
  }

  private async afterMutation(
    actor: Actor,
    typeCode: string,
    action: string,
    targetId: string,
    detail: Record<string, unknown>,
  ) {
    await this.audit.record({
      action: `config.${action}`,
      targetType: 'lookup_value',
      targetId,
      actor,
      after: { typeCode, ...detail },
    });
    await this.outbox.emit({
      type: 'lookup.invalidated.v1',
      aggregateType: 'lookup_type',
      aggregateId: typeCode,
      payload: { typeCode, action, ...detail },
    });
    await this.cache.invalidate(`${NS}:${typeCode}`, { action });
  }

  /** SRS-LKP-012: required closed code sets present + complete. Used by /health/ready. */
  async integrityIssues(): Promise<string[]> {
    const types = await this.db.select().from(lookupType);
    const issues: string[] = [];
    for (const t of types) {
      if (!t.requiredCodes.length) continue;
      const present = new Set(
        (
          await this.db
            .select({ code: lookupValue.code })
            .from(lookupValue)
            .where(eq(lookupValue.typeCode, t.code))
        ).map((r) => r.code),
      );
      for (const c of t.requiredCodes) if (!present.has(c)) issues.push(`${t.code}:${c}`);
    }
    return issues;
  }

  /** minimal usage placeholder — real consumer counts land as modules reference lookups */
  async usage(typeCode: string, valueCode: string) {
    const [type] = await this.db
      .select({ consumers: lookupType.consumerSurfaces })
      .from(lookupType)
      .where(eq(lookupType.code, typeCode))
      .limit(1);
    return {
      typeCode,
      valueCode,
      consumers: (type?.consumers ?? []).map((s) => ({ surface: s, count: 0 })),
      totalReferences: 0,
    };
  }

  isNull = isNull;
}
