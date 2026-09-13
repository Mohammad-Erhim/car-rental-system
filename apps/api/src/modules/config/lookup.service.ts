import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { revOf } from '../../common/i18n-source-rev';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategoryFeature, vehicleFeature } from '../../database/schema/catalogue';
import { driver, driverDocument } from '../../database/schema/customer';
import { vehicleBlock } from '../../database/schema/fleet';
import { translation } from '../../database/schema/i18n';
import { lookupType, lookupValue } from '../../database/schema/lookup';
import { reservation } from '../../database/schema/reservation';

import { LocaleRepo } from './locale.repo';

const NS = 'lookup';

/**
 * FR-ADM-008 "usage count" — where a reference value is actually consumed. Deliberately narrow:
 * only columns with an unambiguous 1:1 mapping to a lookup type (verified against the schema) are
 * listed. A type absent from this map reports `tracked: false` rather than a misleading `0`.
 * Generic `*_event.reason_code` columns are excluded — their code space spans several lookup types
 * by `type`, so a naive count would over-report.
 */
interface UsageRef {
  surface: string;
  table: PgTable;
  column: AnyPgColumn;
  extra?: SQL;
}

const LOOKUP_CONSUMERS: Record<string, UsageRef[]> = {
  cancel_reason: [
    {
      surface: 'reservation.cancellation',
      table: reservation,
      column: reservation.cancelReasonCode,
    },
  ],
  block_reason: [
    {
      surface: 'fleet.vehicle_block',
      table: vehicleBlock,
      column: vehicleBlock.reasonCode,
      extra: ne(vehicleBlock.kind, 'transfer'),
    },
  ],
  transfer_reason: [
    {
      surface: 'fleet.vehicle_transfer',
      table: vehicleBlock,
      column: vehicleBlock.reasonCode,
      extra: eq(vehicleBlock.kind, 'transfer'),
    },
  ],
  document_type: [
    { surface: 'customer.driver_document', table: driverDocument, column: driverDocument.docType },
  ],
  licence_type: [{ surface: 'customer.driver', table: driver, column: driver.licenceType }],
  country: [{ surface: 'customer.driver_licence', table: driver, column: driver.licenceCountry }],
  vehicle_feature: [
    { surface: 'catalogue.vehicle_feature', table: vehicleFeature, column: vehicleFeature.code },
    {
      surface: 'catalogue.category_feature',
      table: vehicleCategoryFeature,
      column: vehicleCategoryFeature.featureCode,
    },
  ],
};

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
    private readonly locales: LocaleRepo,
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
    const matched = rows.filter((t) => {
      if (filter?.classification && t.classification !== filter.classification) return false;
      if (filter?.ownerModule && t.ownerModule !== filter.ownerModule) return false;
      if (
        filter?.search &&
        !`${t.code} ${t.description ?? ''}`.toLowerCase().includes(filter.search.toLowerCase())
      )
        return false;
      return true;
    });
    if (!matched.length) return [];

    // One grouped query for every matched type's active/inactive counts, instead of `getType`'s
    // one-query-per-type (which also redundantly re-fetches the type row this method already
    // has in hand) — a real N+1 once the catalogue has more than a handful of types.
    const counts = await this.db
      .select({
        typeCode: lookupValue.typeCode,
        active: sql<number>`count(*) filter (where ${lookupValue.isActive})::int`,
        inactive: sql<number>`count(*) filter (where not ${lookupValue.isActive})::int`,
      })
      .from(lookupValue)
      .where(
        inArray(
          lookupValue.typeCode,
          matched.map((t) => t.code),
        ),
      )
      .groupBy(lookupValue.typeCode);
    const countsByType = new Map(counts.map((c) => [c.typeCode, c]));

    return matched.map((type) => ({
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
      activeValueCount: countsByType.get(type.code)?.active ?? 0,
      inactiveValueCount: countsByType.get(type.code)?.inactive ?? 0,
      lastSyncedAt: type.lastSyncedAt,
      lastSyncStatus: type.lastSyncStatus,
    }));
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

    // localized labels — read `publishedValue` (the live string, frozen while a later edit is
    // drafted/in-review on the Translations screen) so an in-progress edit never blanks a label
    // that consumers depend on. Mirrors `TranslationService.publishedBundle`. The chain is the
    // *runtime* one (DEC-024) — a dashboard-added locale's own configured fallback is honored,
    // not silently collapsed to English the way the static `@carrental/i18n` helper would.
    const chain = await this.locales.fallbackChain(q.locale ?? 'en');
    const labelRows = (
      await this.db
        .select()
        .from(translation)
        .where(
          and(
            eq(translation.namespace, `${NS}:${typeCode}`),
            isNotNull(translation.publishedValue),
          ),
        )
    ).filter((r): r is typeof r & { publishedValue: string } => r.publishedValue != null);
    const labels = new Map<string, { value: string; locale: string }>();
    for (const loc of [...chain].reverse()) {
      for (const lr of labelRows.filter((r) => r.localeCode === loc)) {
        labels.set(lr.key, { value: lr.publishedValue, locale: loc });
      }
    }
    const translationsByCode = new Map<string, Record<string, string>>();
    for (const lr of labelRows) {
      const m = translationsByCode.get(lr.key) ?? {};
      m[lr.localeCode] = lr.publishedValue;
      translationsByCode.set(lr.key, m);
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
          translations: { en: r.defaultLabel, ...(translationsByCode.get(r.code) ?? {}) },
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

  /**
   * A scope may have at most one default value. Demote whatever is currently default before a
   * create/update marks a new one — bumping their version so a client holding a stale copy gets
   * a conflict rather than silently overwriting.
   */
  private async demoteDefaults(
    typeCode: string,
    scopeKey: string,
    actor: Actor,
    exceptId?: string,
  ) {
    const where = [
      eq(lookupValue.typeCode, typeCode),
      eq(lookupValue.scopeKey, scopeKey),
      eq(lookupValue.isDefault, true),
    ];
    if (exceptId) where.push(ne(lookupValue.id, exceptId));
    await this.db
      .update(lookupValue)
      .set({
        isDefault: false,
        version: sql`${lookupValue.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(and(...where));
  }

  /**
   * Guard a consumer write: the code must be a currently-active value of `typeCode`. Callers that
   * accept a free-form `reasonCode` / `docType` from a form should run this so deactivating or
   * removing a value in Reference data actually takes effect on new records (SRS-LKP-004).
   */
  async assertActiveCode(typeCode: string, code: string, field = 'code'): Promise<void> {
    const { values } = await this.getValues(typeCode);
    if (!values.some((v) => v.code === code)) {
      throw AppError.validation(
        [{ path: field, code: 'unsupported', params: { type: typeCode } }],
        `"${code}" is not an active ${typeCode} value`,
      );
    }
  }

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

    if (input.isDefault) await this.demoteDefaults(typeCode, scopeKey, actor);

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

    if (input.isDefault) await this.demoteDefaults(typeCode, row.scopeKey, actor, valueId);

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

  async setActive(
    actor: Actor,
    typeCode: string,
    valueId: string,
    active: boolean,
    opts: { force?: boolean } = {},
  ) {
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
    // FR-ADM-008: deactivating an in-use value needs an explicit confirmation (`force`).
    if (!active && !opts.force) {
      const { totalReferences } = await this.usage(typeCode, row.code);
      if (totalReferences > 0) {
        throw AppError.businessRule('This value is in use — confirm to deactivate it', {
          reason: 'lookup_value_in_use',
          references: totalReferences,
        });
      }
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
    await this.db.transaction(async (tx) => {
      for (const o of order) {
        await tx
          .update(lookupValue)
          .set({ sortOrder: o.sortOrder, updatedAt: sql`now()`, updatedBy: actor.accountId })
          .where(and(eq(lookupValue.id, o.id), eq(lookupValue.typeCode, typeCode)));
      }
    });
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
    const touched = new Set<string>();
    // the `en` label is the source string these translations are made against — stamp its content
    // hash as `sourceRevision` so the Translations screen's "outdated" check works for lookup rows
    // the same way it does for bundled strings.
    const enSource = (
      labels.en ??
      (
        await this.db
          .select({ value: translation.value })
          .from(translation)
          .where(
            and(
              eq(translation.namespace, `${NS}:${typeCode}`),
              eq(translation.key, code),
              eq(translation.localeCode, 'en'),
            ),
          )
          .limit(1)
      )[0]?.value ??
      ''
    ).trim();
    const rev = revOf(enSource);
    for (const [locale, raw] of Object.entries(labels)) {
      const value = raw?.trim() ?? '';
      // an explicitly-provided empty label clears that locale's override (falls back to `en`)
      if (!value) {
        await this.db
          .delete(translation)
          .where(
            and(
              eq(translation.namespace, `${NS}:${typeCode}`),
              eq(translation.key, code),
              eq(translation.localeCode, locale),
            ),
          );
        touched.add(locale);
        continue;
      }
      // lookup labels have no draft/review step — the edit is the publish, so `value` and
      // `publishedValue` move together.
      await this.db
        .insert(translation)
        .values({
          namespace: `${NS}:${typeCode}`,
          key: code,
          localeCode: locale,
          value,
          publishedValue: value,
          status: 'published',
          sourceRevision: rev,
          reviewedBy: actor.accountId,
          reviewedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [translation.namespace, translation.key, translation.localeCode],
          set: {
            value,
            publishedValue: value,
            status: 'published',
            sourceRevision: rev,
            reviewedBy: actor.accountId,
            reviewedAt: sql`now()`,
            version: sql`${translation.version} + 1`,
            updatedAt: sql`now()`,
          },
        });
      touched.add(locale);
    }
    // keep the i18n bundle ETag in step with the translations screen (both edit the same rows)
    for (const locale of touched) {
      await this.cache.invalidate(`i18n:${locale}`, { namespace: `${NS}:${typeCode}` });
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

  private async countRefs(ref: UsageRef, valueCode: string): Promise<number> {
    const where = ref.extra ? and(eq(ref.column, valueCode), ref.extra) : eq(ref.column, valueCode);
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ref.table)
      .where(where);
    return row?.n ?? 0;
  }

  /**
   * FR-ADM-008 — real reference count for a value across its known consumer columns. `tracked` is
   * false when this type has no mapped consumer yet (so a `0` is not read as "safe to delete").
   */
  async usage(typeCode: string, valueCode: string) {
    const refs = LOOKUP_CONSUMERS[typeCode] ?? [];
    const consumers = await Promise.all(
      refs.map(async (r) => ({ surface: r.surface, count: await this.countRefs(r, valueCode) })),
    );
    return {
      typeCode,
      valueCode,
      consumers,
      totalReferences: consumers.reduce((a, c) => a + c.count, 0),
      tracked: refs.length > 0,
    };
  }
}
