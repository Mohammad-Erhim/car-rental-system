import { createHash } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { template } from '../../database/schema/notify';
import { LocaleRepo } from '../config/locale.repo';
import { WorkflowPublic } from '../workflow/workflow.public';

import { referencedVars, renderTemplate } from './render';

/**
 * SCREEN-OPS-033 / FR-ADM-011 — notification template administration (content half). Manage the
 * localized subject/body/variables of a transactional template, preview with sample values, and
 * move it draft → in_review → published with a validation gate (declared variables, required
 * legal content, every active locale covered). The event-rules half (trigger/audience/timing/
 * retry/escalation/sender-identity) is a documented follow-up — see `05-system-validation/decision-list.md` D-4.
 */
export interface TemplateVar {
  name: string;
  required?: boolean;
  legal?: boolean;
}

/** Preview renders unescaped: the ops editor displays it as plain React text (already
 *  auto-escaped for the browser by React itself, not `dangerouslySetInnerHTML`), so escaping
 *  here would double-escape and show a staff member literal "&amp;"/"&#39;" characters that
 *  were never actually in their sample value. `notify.service.ts`'s real send path is the one
 *  that HTML-escapes, since that's the one whose output can end up interpreted as HTML markup. */
function renderTpl(tpl: string, vars: Record<string, unknown>): string {
  return renderTemplate(tpl, vars, { escape: false });
}

export interface TemplateDraftInput {
  key: string;
  channel: string;
  localeCode: string;
  subject?: string | null;
  bodyTemplate: string;
  variables: TemplateVar[];
  note?: string;
}

@Injectable()
export class TemplateService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly localeRepo: LocaleRepo,
    private readonly workflows: WorkflowPublic,
  ) {}

  /** Publishing a message template is an action an owner can put a pipeline in front of. */
  onModuleInit(): void {
    this.workflows.register({
      key: 'template.publish',
      subjectType: 'template',
      label: 'Publish a message template',
      description: 'Make a drafted email/SMS template live for one language.',
      variables: ['key', 'channel', 'localeCode'],
      fingerprint: async (id, tx) => {
        const [row] = await tx.select().from(template).where(eq(template.id, id)).limit(1);
        if (!row) return null;
        return createHash('sha256')
          .update(
            JSON.stringify([
              row.key,
              row.channel,
              row.localeCode,
              row.subject,
              row.bodyTemplate,
              row.variables,
            ]),
          )
          .digest('hex');
      },
      subjectOwner: async (id, tx) => {
        const [row] = await tx
          .select({ by: template.createdBy })
          .from(template)
          .where(eq(template.id, id))
          .limit(1);
        return row?.by ? { accountId: row.by } : null;
      },
      onCaptured: async ({ tx, subjectId }) => {
        await tx
          .update(template)
          .set({ status: 'in_review', updatedAt: sql`now()` })
          .where(and(eq(template.id, subjectId), eq(template.status, 'draft')));
      },
      execute: async ({ tx, subjectId, actors, audit }) => {
        const [row] = await tx.select().from(template).where(eq(template.id, subjectId)).limit(1);
        if (!row || (row.status !== 'in_review' && row.status !== 'draft')) {
          throw new Error('The template is no longer waiting to be published');
        }
        this.assertPublishable(row);
        const done = await this.publishRow(
          tx,
          row,
          actors.finalDeciderAccountId ?? actors.initiatorAccountId,
        );
        audit({
          action: 'notify.template.published',
          targetType: 'template',
          targetId: subjectId,
          actor: {
            accountId: actors.finalDeciderAccountId ?? actors.initiatorAccountId,
            displayName: actors.finalDeciderLabel ?? actors.initiatorLabel ?? undefined,
            kind: 'staff',
          },
          after: {
            version: done.version,
            key: row.key,
            localeCode: row.localeCode,
            viaWorkflow: true,
          },
        });
        return { version: done.version };
      },
      // a template has no "rejected" state: whatever the outcome, it goes back to its author as a draft
      onClosed: async ({ tx, subjectId, reason, audit }) => {
        await tx
          .update(template)
          .set({ status: 'draft', updatedAt: sql`now()` })
          .where(and(eq(template.id, subjectId), eq(template.status, 'in_review')));
        audit({ action: `notify.template.${reason}`, targetType: 'template', targetId: subjectId });
      },
    });
  }

  private activeLocaleCodes(): Promise<string[]> {
    return this.localeRepo.activeCodes();
  }

  /** Templates grouped by (key, channel) with a per-locale status + a publish-readiness note. */
  async list() {
    const rows = await this.db
      .select()
      .from(template)
      .orderBy(
        asc(template.key),
        asc(template.channel),
        asc(template.localeCode),
        desc(template.version),
      );
    const active = await this.activeLocaleCodes();

    const groups = new Map<string, ReturnType<typeof this.groupShape>>();
    for (const r of rows) {
      const gk = `${r.key}::${r.channel}`;
      if (!groups.has(gk)) groups.set(gk, this.groupShape(r.key, r.channel));
      const g = groups.get(gk)!;
      // keep only the newest row per locale (rows are version-desc)
      if (!g.locales.some((l) => l.localeCode === r.localeCode)) {
        g.locales.push({
          localeCode: r.localeCode,
          version: r.version,
          status: r.status,
          updatedAt: r.updatedAt,
          hasDraft: rows.some(
            (x) =>
              x.key === r.key &&
              x.channel === r.channel &&
              x.localeCode === r.localeCode &&
              x.status === 'draft',
          ),
        });
      }
    }
    return [...groups.values()].map((g) => {
      const publishedLocales = new Set(
        g.locales.filter((l) => l.status === 'published').map((l) => l.localeCode),
      );
      g.missingLocales = active.filter((c) => !publishedLocales.has(c));
      return g;
    });
  }

  private groupShape(key: string, channel: string) {
    return {
      key,
      channel,
      locales: [] as Array<{
        localeCode: string;
        version: string;
        status: string;
        updatedAt: string;
        hasDraft: boolean;
      }>,
      missingLocales: [] as string[],
    };
  }

  /**
   * The editable row for (key, channel, locale): the open revision (draft **or** in_review) if
   * any, else the published one. `hasOpenDraft` means "an unpublished revision exists" so the
   * editor keeps showing Submit/Publish after the draft has been submitted for review.
   */
  async get(key: string, channel: string, localeCode: string) {
    const rows = await this.db
      .select()
      .from(template)
      .where(
        and(
          eq(template.key, key),
          eq(template.channel, channel),
          eq(template.localeCode, localeCode),
        ),
      )
      .orderBy(desc(template.version));
    if (rows.length === 0) throw AppError.notFound('template');
    const open = rows.find((r) => r.status === 'draft' || r.status === 'in_review');
    const published = rows.find((r) => r.status === 'published');
    const row = open ?? published ?? rows[0]!;
    return {
      id: row.id,
      key: row.key,
      channel: row.channel,
      localeCode: row.localeCode,
      version: row.version,
      status: row.status,
      subject: row.subject,
      bodyTemplate: row.bodyTemplate,
      variables: row.variables as TemplateVar[],
      publishedVersion: published?.version ?? null,
      hasOpenDraft: !!open,
    };
  }

  /** Create or replace the single open draft for (key, channel, locale). */
  async saveDraft(actor: Actor, input: TemplateDraftInput) {
    const active = await this.activeLocaleCodes();
    if (!active.includes(input.localeCode)) {
      throw new AppError('validation_failed', {
        title: 'Unknown or inactive locale',
        fieldErrors: [{ path: 'localeCode', code: 'unsupported' }],
      });
    }
    // Drafts may be incomplete — only structural rules are enforced here (no `{{var}}` that is
    // not declared, non-empty body). Legal-content + full-coverage checks run at publish.
    const issues = this.structuralIssues(input.subject ?? '', input.bodyTemplate, input.variables);
    if (issues.length) {
      throw AppError.validation(
        issues.map((message) => ({
          path: 'bodyTemplate',
          code: 'template_content',
          params: { message },
        })),
        'Template content is invalid',
      );
    }
    const draftVersion = 'draft';
    const [existing] = await this.db
      .select()
      .from(template)
      .where(
        and(
          eq(template.key, input.key),
          eq(template.channel, input.channel),
          eq(template.localeCode, input.localeCode),
          eq(template.version, draftVersion),
        ),
      )
      .limit(1);

    let row;
    if (existing) {
      [row] = await this.db
        .update(template)
        .set({
          subject: input.subject ?? null,
          bodyTemplate: input.bodyTemplate,
          variables: input.variables,
          status: 'draft',
          updatedBy: actor.accountId,
          updatedAt: sql`now()`,
        })
        .where(eq(template.id, existing.id))
        .returning();
      // edited while a request was waiting on it → that request no longer describes this content, so it
      // is closed and a fresh one starts (with whatever route the new content now takes)
      if (existing.status === 'in_review') {
        await this.workflows.restartOpen({
          actor,
          actionKey: 'template.publish',
          subjectId: existing.id,
          context: { key: input.key, channel: input.channel, localeCode: input.localeCode },
        });
      }
    } else {
      [row] = await this.db
        .insert(template)
        .values({
          key: input.key,
          channel: input.channel,
          localeCode: input.localeCode,
          version: draftVersion,
          subject: input.subject ?? null,
          bodyTemplate: input.bodyTemplate,
          variables: input.variables,
          status: 'draft',
          createdBy: actor.accountId,
        })
        .returning();
    }
    await this.audit.record({
      action: 'notify.template.drafted',
      targetType: 'template',
      targetId: row!.id,
      actor,
      after: { key: input.key, channel: input.channel, localeCode: input.localeCode },
    });
    return this.get(input.key, input.channel, input.localeCode);
  }

  async submit(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.status !== 'draft') {
      throw AppError.businessRule(`A ${row.status} template cannot be submitted`, {
        reason: row.status,
      });
    }
    await this.db
      .update(template)
      .set({ status: 'in_review', updatedAt: sql`now()` })
      .where(eq(template.id, id));
    await this.audit.record({
      action: 'notify.template.submitted',
      targetType: 'template',
      targetId: id,
      actor,
    });
    return this.get(row.key, row.channel, row.localeCode);
  }

  /**
   * Publish a template revision. Direct by default (whoever holds `config.publish` publishes their
   * own draft); with a workflow bound to `template.publish` it goes through the pipeline first.
   */
  async publish(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.status !== 'in_review' && row.status !== 'draft') {
      throw AppError.businessRule(`A ${row.status} template cannot be published`, {
        reason: row.status,
      });
    }
    this.assertPublishable(row);

    const acted = await this.workflows.actOnOpen({
      actor,
      actionKey: 'template.publish',
      subjectId: id,
      decision: 'approve',
      strict: false,
    });
    if (acted)
      return { ...(await this.get(row.key, row.channel, row.localeCode)), workflow: acted };

    const gate = await this.workflows.gate({
      actionKey: 'template.publish',
      subjectId: id,
      subjectLabel: `${row.key} · ${row.channel} · ${row.localeCode}`,
      context: { key: row.key, channel: row.channel, localeCode: row.localeCode },
      actor,
    });
    if (!gate.direct) {
      return { ...(await this.get(row.key, row.channel, row.localeCode)), workflow: gate.summary };
    }

    const done = await this.db.transaction((tx) =>
      this.publishRow(tx as unknown as Database, row, actor.accountId),
    );
    await this.audit.record({
      action: 'notify.template.published',
      targetType: 'template',
      targetId: id,
      actor,
      before: done.previousVersion ? { version: done.previousVersion } : undefined,
      after: { version: done.version, key: row.key, localeCode: row.localeCode },
    });
    return this.get(row.key, row.channel, row.localeCode);
  }

  private assertPublishable(row: typeof template.$inferSelect): void {
    const contentIssues = this.publishIssues(
      row.subject ?? '',
      row.bodyTemplate,
      row.variables as TemplateVar[],
    );
    if (contentIssues.length) {
      throw AppError.businessRule(`Template not ready: ${contentIssues.join('; ')}`, {
        reason: 'content_invalid',
      });
    }
  }

  /** The publish itself, inside `tx`: retire the live version, make this one live, announce it. */
  private async publishRow(
    tx: Database,
    row: typeof template.$inferSelect,
    publishedBy: string,
  ): Promise<{ version: string; previousVersion: string | null }> {
    const [prevPublished] = await tx
      .select()
      .from(template)
      .where(
        and(
          eq(template.key, row.key),
          eq(template.channel, row.channel),
          eq(template.localeCode, row.localeCode),
          eq(template.status, 'published'),
        ),
      )
      .orderBy(desc(template.publishedAt))
      .limit(1);

    // bump past the highest existing version for this (key, channel, locale) — including retired
    // rows — so `(key,channel,locale,version)` never collides.
    const allVersions = await tx
      .select({ version: template.version })
      .from(template)
      .where(
        and(
          eq(template.key, row.key),
          eq(template.channel, row.channel),
          eq(template.localeCode, row.localeCode),
        ),
      );
    const maxVersion = allVersions
      .map((v) => v.version)
      .filter((v) => /^\d+\.\d+$/.test(v))
      .sort((a, b) => cmpVersion(a, b))
      .at(-1);
    const nextVersion = bumpVersion(maxVersion ?? prevPublished?.version ?? '0.0');

    if (prevPublished) {
      await tx
        .update(template)
        .set({ status: 'retired', updatedAt: sql`now()` })
        .where(eq(template.id, prevPublished.id));
    }
    await tx
      .update(template)
      .set({
        status: 'published',
        version: nextVersion,
        publishedAt: sql`now()`,
        publishedBy,
        updatedAt: sql`now()`,
      })
      .where(eq(template.id, row.id));
    await this.outbox.emit(
      {
        type: 'notify.template.published.v1',
        aggregateType: 'template',
        aggregateId: row.id,
        payload: {
          key: row.key,
          channel: row.channel,
          localeCode: row.localeCode,
          version: nextVersion,
        },
      },
      tx,
    );
    return { version: nextVersion, previousVersion: prevPublished?.version ?? null };
  }

  /** Render a preview with sample values; report any unresolved variable. */
  async preview(input: {
    subject?: string | null;
    bodyTemplate: string;
    variables: TemplateVar[];
    sample?: Record<string, unknown>;
  }) {
    const sample = { ...COMMON_SAMPLE, ...(input.sample ?? {}) };
    const referenced = referencedVars(input.subject ?? '', input.bodyTemplate);
    // "missing" = referenced in the content but with no sample value to render → shows blank
    const missing = referenced.filter((v) => sample[v] == null);
    return {
      subject: renderTpl(input.subject ?? '', sample),
      body: renderTpl(input.bodyTemplate, sample),
      missingVars: missing,
      contentIssues: this.publishIssues(input.subject ?? '', input.bodyTemplate, input.variables),
    };
  }

  /** Publish-readiness for a (key, channel) across every active locale. */
  async readiness(key: string, channel: string) {
    const active = await this.activeLocaleCodes();
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.key, key), eq(template.channel, channel)));
    const perLocale = active.map((code) => {
      const published = rows.find((r) => r.localeCode === code && r.status === 'published');
      const draft = rows.find((r) => r.localeCode === code && r.status === 'draft');
      const issues = published
        ? this.publishIssues(
            published.subject ?? '',
            published.bodyTemplate,
            published.variables as TemplateVar[],
          )
        : ['no published version'];
      return { localeCode: code, published: !!published, hasDraft: !!draft, issues };
    });
    return {
      key,
      channel,
      ready: perLocale.every((l) => l.published && l.issues.length === 0),
      perLocale,
    };
  }

  /** Enforced on every draft save — a template that breaks these can never be coherent. */
  private structuralIssues(subject: string, body: string, variables: TemplateVar[]): string[] {
    const issues: string[] = [];
    if (!body.trim()) issues.push('body is empty');
    const declared = new Set(variables.map((v) => v.name));
    for (const v of referencedVars(subject, body)) {
      if (!declared.has(v)) issues.push(`{{${v}}} is used but not declared`);
    }
    return issues;
  }

  /** Enforced at publish — structural + required legal content must actually appear. */
  private publishIssues(subject: string, body: string, variables: TemplateVar[]): string[] {
    const issues = this.structuralIssues(subject, body, variables);
    const used = referencedVars(subject, body);
    for (const v of variables) {
      if (v.legal && v.required && !used.includes(v.name)) {
        issues.push(`required legal variable "${v.name}" is not present in the content`);
      }
    }
    return issues;
  }

  private async load(id: string) {
    const [row] = await this.db.select().from(template).where(eq(template.id, id)).limit(1);
    if (!row) throw AppError.notFound('template');
    return row;
  }
}

function bumpVersion(v: string): string {
  const [maj, min] = v.split('.').map((n) => Number(n) || 0);
  return `${maj ?? 0}.${(min ?? 0) + 1}`;
}

function cmpVersion(a: string, b: string): number {
  const [am, an] = a.split('.').map(Number);
  const [bm, bn] = b.split('.').map(Number);
  return (am ?? 0) - (bm ?? 0) || (an ?? 0) - (bn ?? 0);
}

const COMMON_SAMPLE: Record<string, string> = {
  reference: 'RES-SAMPLE1',
  name: 'Alex Sample',
  amount: '199.00',
  currency: 'USD',
  date: '2026-10-01',
  code: '123456',
  link: 'https://example.test/verify/123456',
  terms: 'Standard rental terms apply.',
  refund_terms: 'Refunds are processed within 5 business days.',
};
