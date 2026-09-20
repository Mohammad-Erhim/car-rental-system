import {
  DIRECT_WORKFLOW,
  twoPersonReviewSpec,
  validateWorkflowGraph,
  zWorkflowSpec,
  type ActorSelector,
  type WorkflowIssue,
  type WorkflowSpec,
} from '@carrental/contracts';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { isUniqueViolation } from '../../common/db-error';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { account, role, staffGroup, staffProfile } from '../../database/schema/iam';
import { organization } from '../../database/schema/org';
import {
  workflowBinding,
  workflowDefinition,
  workflowDefinitionVersion,
} from '../../database/schema/workflow';

import { WorkflowActorsService } from './workflow-actors.service';
import { checkCondition, evaluateCondition } from './workflow-conditions';
import { WorkflowRegistry } from './workflow-registry.service';

type Exec = Pick<Database, 'select'>;

export interface LoadedVersion {
  id: string;
  definitionId: string;
  name: string;
  revision: number;
  spec: WorkflowSpec;
}

/** Definitions, their immutable versions, and the bindings that attach them to actions. */
@Injectable()
export class WorkflowDefinitionService implements OnApplicationBootstrap {
  private readonly logger = new Logger('WorkflowDefinitions');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registry: WorkflowRegistry,
    private readonly actors: WorkflowActorsService,
    private readonly audit: AuditService,
  ) {}

  /** Every organisation always has the built-in starting points. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const orgs = await this.db.select({ id: organization.id }).from(organization);
      for (const o of orgs) await this.ensureBuiltIns(o.id);
    } catch (err) {
      this.logger.warn(`could not ensure built-in workflows: ${(err as Error).message}`);
    }
  }

  ensureBuiltIns(orgId: string): Promise<void> {
    return this.ensureSystemDefinitions(orgId, [
      {
        code: 'direct',
        name: 'Direct — no review',
        description: 'The change is applied immediately. Nobody is asked.',
        spec: DIRECT_WORKFLOW,
      },
      {
        code: 'two_person_review',
        name: 'Two-person review',
        description:
          'A location manager other than the requester must approve before the change is applied.',
        spec: twoPersonReviewSpec('manager'),
      },
    ]);
  }

  // ───────────── runtime lookups (used by the engine) ─────────────

  async loadVersion(versionId: string, exec: Exec = this.db): Promise<LoadedVersion> {
    const [row] = await exec
      .select({
        id: workflowDefinitionVersion.id,
        definitionId: workflowDefinitionVersion.definitionId,
        revision: workflowDefinitionVersion.revision,
        spec: workflowDefinitionVersion.spec,
        name: workflowDefinition.name,
      })
      .from(workflowDefinitionVersion)
      .innerJoin(
        workflowDefinition,
        eq(workflowDefinition.id, workflowDefinitionVersion.definitionId),
      )
      .where(eq(workflowDefinitionVersion.id, versionId))
      .limit(1);
    if (!row) throw AppError.notFound('workflow version');
    return { ...row, spec: zWorkflowSpec.parse(row.spec) };
  }

  async namesForVersions(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: workflowDefinitionVersion.id, name: workflowDefinition.name })
      .from(workflowDefinitionVersion)
      .innerJoin(
        workflowDefinition,
        eq(workflowDefinition.id, workflowDefinitionVersion.definitionId),
      )
      .where(inArray(workflowDefinitionVersion.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * The definition that governs `actionKey` for a request with this context: the highest-priority
   * active binding whose condition matches. `null` = no binding applies → the action is direct.
   */
  async resolveBinding(
    orgId: string,
    actionKey: string,
    context: Record<string, unknown>,
    exec: Exec = this.db,
  ): Promise<{
    definitionId: string;
    versionId: string;
    definitionName: string;
    spec: WorkflowSpec;
  } | null> {
    const bindings = await exec
      .select()
      .from(workflowBinding)
      .where(
        and(
          eq(workflowBinding.organizationId, orgId),
          eq(workflowBinding.actionKey, actionKey),
          eq(workflowBinding.active, true),
        ),
      )
      .orderBy(desc(workflowBinding.priority), asc(workflowBinding.createdAt));
    for (const b of bindings) {
      if (b.condition && !evaluateCondition(b.condition, context)) continue;
      const [live] = await exec
        .select({ id: workflowDefinitionVersion.id })
        .from(workflowDefinitionVersion)
        .where(
          and(
            eq(workflowDefinitionVersion.definitionId, b.definitionId),
            eq(workflowDefinitionVersion.status, 'published'),
          ),
        )
        .limit(1);
      if (!live) {
        throw new AppError('state_conflict', {
          title: 'A workflow is bound to this action but has no published version',
          params: { reason: 'workflow_unpublished', actionKey },
        });
      }
      const v = await this.loadVersion(live.id, exec);
      return {
        definitionId: v.definitionId,
        versionId: v.id,
        definitionName: v.name,
        spec: v.spec,
      };
    }
    return null;
  }

  // ───────────── validation ─────────────

  /**
   * Everything that can be wrong with a definition: shape, graph, and — because a pipeline nobody can
   * act on is a dead end (§2.1 #5) — whether every step's actors resolve to at least one active
   * person right now. Returns issues; never throws for a bad definition.
   */
  async validate(orgId: string, raw: unknown, actionKeys: string[] = []): Promise<WorkflowIssue[]> {
    const parsed = zWorkflowSpec.safeParse(raw);
    if (!parsed.success) {
      return parsed.error.issues.map((i) => ({
        code: 'invalid_shape',
        message: `${i.path.join('.') || 'definition'}: ${i.message}`,
        ...(typeof i.path[1] === 'string' && i.path[0] === 'steps' ? { stepId: i.path[1] } : {}),
      }));
    }
    const spec = parsed.data;
    const issues = validateWorkflowGraph(spec);

    const known = await this.knownSelectorTargets(orgId, spec);
    const check = async (
      selectors: readonly ActorSelector[],
      where: { stepId?: string; label: string },
      opts: { excludeInitiator?: boolean } = {},
    ) => {
      for (const s of selectors) {
        if (s.kind === 'role' && !known.roles.has(s.roleCode))
          issues.push({
            code: 'unknown_role',
            message: `${where.label}: the role "${s.roleCode}" does not exist or is archived`,
            stepId: where.stepId,
          });
        if (s.kind === 'group' && !known.groups.has(s.groupId))
          issues.push({
            code: 'unknown_group',
            message: `${where.label}: that team does not exist or is archived`,
            stepId: where.stepId,
          });
      }
      const dynamic = selectors.some((s) => s.kind === 'dynamic' && s.source === 'subject_owner');
      const who = await this.actors.resolve(
        selectors,
        { organizationId: orgId },
        { excludeInitiator: opts.excludeInitiator },
      );
      // a dynamic "subject owner" is resolved per request, so it counts as reachable
      const onlyInitiator = selectors.every(
        (s) => s.kind === 'dynamic' && s.source === 'initiator',
      );
      if (!who.length && !dynamic && !onlyInitiator) {
        issues.push({
          code: 'no_actor',
          message: `${where.label}: nobody is currently able to act`,
          stepId: where.stepId,
        });
      }
    };
    for (const step of Object.values(spec.steps)) {
      if (step.type === 'approval' || step.type === 'task') {
        await check(
          step.actors.selectors,
          { stepId: step.id, label: `Step "${step.name}"` },
          { excludeInitiator: false },
        );
        if (step.due?.escalateTo?.length)
          await check(step.due.escalateTo, {
            stepId: step.id,
            label: `Escalation of "${step.name}"`,
          });
      }
      if (step.type === 'auto' && step.notify?.length) {
        await check(step.notify, { stepId: step.id, label: `Notification "${step.name}"` });
      }
    }
    await check(spec.fallbackActors, { label: 'Fallback actors' });

    // conditions may only read variables the bound action(s) provide (plus the built-ins)
    const variables = new Set<string>(['location', 'initiator_roles']);
    for (const key of actionKeys)
      for (const v of this.registry.get(key)?.variables ?? []) variables.add(v);
    if (actionKeys.length) {
      for (const step of Object.values(spec.steps)) {
        if (step.type !== 'condition') continue;
        for (const [i, b] of step.branches.entries()) {
          for (const c of checkCondition(b.when, [...variables])) {
            issues.push({
              code: `condition_${c.code}`,
              message: `Step "${step.name}", branch ${i + 1}: ${c.message}`,
              stepId: step.id,
            });
          }
        }
      }
    }
    return issues;
  }

  private async knownSelectorTargets(orgId: string, spec: WorkflowSpec) {
    const all: ActorSelector[] = [...spec.fallbackActors];
    for (const s of Object.values(spec.steps)) {
      if (s.type === 'approval' || s.type === 'task') {
        all.push(...s.actors.selectors, ...(s.due?.escalateTo ?? []));
      } else if (s.type === 'auto') all.push(...(s.notify ?? []));
    }
    const roleCodes = [...new Set(all.flatMap((s) => (s.kind === 'role' ? [s.roleCode] : [])))];
    const groupIds = [...new Set(all.flatMap((s) => (s.kind === 'group' ? [s.groupId] : [])))];
    const roles = roleCodes.length
      ? await this.db
          .select({ code: role.code })
          .from(role)
          .where(
            and(
              inArray(role.code, roleCodes),
              isNull(role.archivedAt),
              or(isNull(role.organizationId), eq(role.organizationId, orgId)),
            ),
          )
      : [];
    const groups = groupIds.length
      ? await this.db
          .select({ id: staffGroup.id })
          .from(staffGroup)
          .where(
            and(
              inArray(staffGroup.id, groupIds),
              isNull(staffGroup.archivedAt),
              eq(staffGroup.organizationId, orgId),
            ),
          )
      : [];
    return { roles: new Set(roles.map((r) => r.code)), groups: new Set(groups.map((g) => g.id)) };
  }

  // ───────────── definitions ─────────────

  async list(orgId: string) {
    await this.ensureBuiltIns(orgId);
    const defs = await this.db
      .select()
      .from(workflowDefinition)
      .where(eq(workflowDefinition.organizationId, orgId))
      .orderBy(desc(workflowDefinition.isSystem), asc(workflowDefinition.name));
    if (!defs.length) return [];
    const versions = await this.db
      .select({
        id: workflowDefinitionVersion.id,
        definitionId: workflowDefinitionVersion.definitionId,
        revision: workflowDefinitionVersion.revision,
        status: workflowDefinitionVersion.status,
        spec: workflowDefinitionVersion.spec,
      })
      .from(workflowDefinitionVersion)
      .where(
        inArray(
          workflowDefinitionVersion.definitionId,
          defs.map((d) => d.id),
        ),
      );
    const bindings = await this.db
      .select({ definitionId: workflowBinding.definitionId, n: sql<number>`count(*)::int` })
      .from(workflowBinding)
      .where(and(eq(workflowBinding.organizationId, orgId), eq(workflowBinding.active, true)))
      .groupBy(workflowBinding.definitionId);
    const used = new Map(bindings.map((b) => [b.definitionId, b.n]));
    return defs.map((d) => {
      const mine = versions.filter((v) => v.definitionId === d.id);
      const live = mine.find((v) => v.status === 'published');
      const draft = mine.find((v) => v.status === 'draft');
      const spec = (live?.spec ?? draft?.spec) as { steps?: Record<string, unknown> } | undefined;
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description,
        isSystem: d.isSystem,
        archived: !!d.archivedAt,
        publishedRevision: live?.revision ?? null,
        hasDraft: !!draft,
        stepCount: Object.keys(spec?.steps ?? {}).length,
        boundActions: used.get(d.id) ?? 0,
      };
    });
  }

  async get(orgId: string, id: string) {
    const def = await this.loadDefinition(orgId, id);
    const versions = await this.db
      .select()
      .from(workflowDefinitionVersion)
      .where(eq(workflowDefinitionVersion.definitionId, id))
      .orderBy(desc(workflowDefinitionVersion.revision));
    return {
      id: def.id,
      code: def.code,
      name: def.name,
      description: def.description,
      isSystem: def.isSystem,
      archived: !!def.archivedAt,
      versions: versions.map((v) => ({
        id: v.id,
        revision: v.revision,
        status: v.status,
        spec: v.spec,
        note: v.note,
        publishedAt: v.publishedAt,
        createdAt: v.createdAt,
      })),
    };
  }

  async create(
    actor: Actor,
    input: { code: string; name: string; description?: string; spec: unknown; note?: string },
  ) {
    const orgId = this.orgOf(actor);
    const spec = zWorkflowSpec.safeParse(input.spec);
    if (!spec.success)
      throw AppError.validation(
        spec.error.issues.map((i) => ({ path: `spec.${i.path.join('.')}`, code: i.code })),
      );
    let created!: typeof workflowDefinition.$inferSelect;
    try {
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(workflowDefinition)
          .values({
            organizationId: orgId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            createdBy: actor.accountId,
          })
          .returning();
        created = row!;
        await tx.insert(workflowDefinitionVersion).values({
          definitionId: created.id,
          revision: 1,
          status: 'draft',
          spec: spec.data as unknown as Record<string, unknown>,
          note: input.note ?? null,
          createdBy: actor.accountId,
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw AppError.businessRule('A workflow with that code already exists', {
          reason: 'workflow_code_taken',
        });
      }
      throw err;
    }
    await this.audit.record({
      action: 'workflow.definition.created',
      targetType: 'workflow_definition',
      targetId: created.id,
      actor,
      after: { code: input.code, name: input.name },
    });
    return this.get(orgId, created.id);
  }

  /** Edit the working draft (creating one from the live version if there is none). */
  async saveDraft(
    actor: Actor,
    id: string,
    input: { spec: unknown; name?: string; description?: string; note?: string },
  ) {
    const orgId = this.orgOf(actor);
    const def = await this.loadDefinition(orgId, id);
    if (def.isSystem)
      throw AppError.businessRule('Built-in workflows cannot be edited — clone one instead', {
        reason: 'workflow_system',
      });
    if (def.archivedAt)
      throw AppError.businessRule('An archived workflow cannot be edited', {
        reason: 'workflow_archived',
      });
    const spec = zWorkflowSpec.safeParse(input.spec);
    if (!spec.success)
      throw AppError.validation(
        spec.error.issues.map((i) => ({ path: `spec.${i.path.join('.')}`, code: i.code })),
      );

    await this.db.transaction(async (tx) => {
      if (input.name || input.description !== undefined) {
        await tx
          .update(workflowDefinition)
          .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(workflowDefinition.id, id));
      }
      const [draft] = await tx
        .select()
        .from(workflowDefinitionVersion)
        .where(
          and(
            eq(workflowDefinitionVersion.definitionId, id),
            eq(workflowDefinitionVersion.status, 'draft'),
          ),
        )
        .for('update');
      if (draft) {
        await tx
          .update(workflowDefinitionVersion)
          .set({
            spec: spec.data as unknown as Record<string, unknown>,
            note: input.note ?? draft.note,
            updatedAt: sql`now()`,
          })
          .where(eq(workflowDefinitionVersion.id, draft.id));
      } else {
        const [last] = await tx
          .select({ r: workflowDefinitionVersion.revision })
          .from(workflowDefinitionVersion)
          .where(eq(workflowDefinitionVersion.definitionId, id))
          .orderBy(desc(workflowDefinitionVersion.revision))
          .limit(1);
        await tx.insert(workflowDefinitionVersion).values({
          definitionId: id,
          revision: (last?.r ?? 0) + 1,
          status: 'draft',
          spec: spec.data as unknown as Record<string, unknown>,
          note: input.note ?? null,
          createdBy: actor.accountId,
        });
      }
    });
    await this.audit.record({
      action: 'workflow.definition.drafted',
      targetType: 'workflow_definition',
      targetId: id,
      actor,
    });
    return this.get(orgId, id);
  }

  /** Publish the working draft. Blocked while the validator finds anything wrong. */
  async publish(actor: Actor, id: string, opts: { versionId?: string } = {}) {
    const orgId = this.orgOf(actor);
    const def = await this.loadDefinition(orgId, id);
    if (def.archivedAt)
      throw AppError.businessRule('An archived workflow cannot be published', {
        reason: 'workflow_archived',
      });
    const [draft] = await this.db
      .select()
      .from(workflowDefinitionVersion)
      .where(
        and(
          eq(workflowDefinitionVersion.definitionId, id),
          opts.versionId
            ? eq(workflowDefinitionVersion.id, opts.versionId)
            : eq(workflowDefinitionVersion.status, 'draft'),
        ),
      )
      .limit(1);
    if (!draft || draft.status === 'published') {
      throw AppError.businessRule('There is no draft to publish', { reason: 'workflow_no_draft' });
    }
    const bound = await this.db
      .select({ actionKey: workflowBinding.actionKey })
      .from(workflowBinding)
      .where(and(eq(workflowBinding.definitionId, id), eq(workflowBinding.active, true)));
    const issues = await this.validate(
      orgId,
      draft.spec,
      bound.map((b) => b.actionKey),
    );
    if (issues.length) {
      throw AppError.businessRule(
        'This workflow has problems that must be fixed before it can be published',
        { reason: 'workflow_invalid', issues: issues as never },
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(workflowDefinitionVersion)
        .set({ status: 'superseded', updatedAt: sql`now()` })
        .where(
          and(
            eq(workflowDefinitionVersion.definitionId, id),
            eq(workflowDefinitionVersion.status, 'published'),
          ),
        );
      await tx
        .update(workflowDefinitionVersion)
        .set({
          status: 'published',
          publishedAt: sql`now()`,
          publishedBy: actor.accountId,
          updatedAt: sql`now()`,
        })
        .where(eq(workflowDefinitionVersion.id, draft.id));
    });
    await this.audit.record({
      action: 'workflow.definition.published',
      targetType: 'workflow_definition',
      targetId: id,
      actor,
      after: { revision: draft.revision },
    });
    return this.get(orgId, id);
  }

  async clone(actor: Actor, id: string, input: { code: string; name: string }) {
    const orgId = this.orgOf(actor);
    const src = await this.get(orgId, id);
    const live = src.versions.find((v) => v.status === 'published') ?? src.versions[0];
    if (!live) throw AppError.notFound('workflow');
    return this.create(actor, {
      code: input.code,
      name: input.name,
      description: src.description ?? undefined,
      spec: live.spec,
      note: `Cloned from ${src.name}`,
    });
  }

  async archive(actor: Actor, id: string) {
    const orgId = this.orgOf(actor);
    const def = await this.loadDefinition(orgId, id);
    if (def.isSystem)
      throw AppError.businessRule('Built-in workflows cannot be archived', {
        reason: 'workflow_system',
      });
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(workflowBinding)
      .where(and(eq(workflowBinding.definitionId, id), eq(workflowBinding.active, true)));
    if (n)
      throw AppError.businessRule('This workflow is still bound to actions — unbind it first', {
        reason: 'workflow_in_use',
      });
    await this.db
      .update(workflowDefinition)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(workflowDefinition.id, id));
    await this.audit.record({
      action: 'workflow.definition.archived',
      targetType: 'workflow_definition',
      targetId: id,
      actor,
    });
  }

  /** Everyone and everything a step can address: the builder's pickers. Active people only. */
  async options(orgId: string) {
    const [roles, groups, people] = await Promise.all([
      this.db
        .select({ code: role.code, name: role.name, isSystem: role.isSystem })
        .from(role)
        .where(
          and(
            isNull(role.archivedAt),
            or(isNull(role.organizationId), eq(role.organizationId, orgId)),
          ),
        )
        .orderBy(asc(role.name)),
      this.db
        .select({ id: staffGroup.id, code: staffGroup.code, name: staffGroup.name })
        .from(staffGroup)
        .where(and(eq(staffGroup.organizationId, orgId), isNull(staffGroup.archivedAt)))
        .orderBy(asc(staffGroup.name)),
      this.db
        .select({
          staffProfileId: staffProfile.id,
          name: account.displayName,
          email: account.email,
        })
        .from(staffProfile)
        .innerJoin(account, eq(account.id, staffProfile.accountId))
        .where(
          and(
            eq(staffProfile.organizationId, orgId),
            eq(staffProfile.status, 'active'),
            eq(account.status, 'active'),
          ),
        )
        .orderBy(asc(account.displayName)),
    ]);
    return { roles, groups, people };
  }

  // ───────────── bindings ─────────────

  actions() {
    return this.registry.list().map((a) => ({
      key: a.key,
      subjectType: a.subjectType,
      label: a.label,
      description: a.description,
      variables: [...a.variables, 'location', 'initiator_roles'],
      securityCritical: !!a.securityCritical,
    }));
  }

  async bindings(orgId: string) {
    const rows = await this.db
      .select({
        id: workflowBinding.id,
        actionKey: workflowBinding.actionKey,
        definitionId: workflowBinding.definitionId,
        definitionName: workflowDefinition.name,
        condition: workflowBinding.condition,
        priority: workflowBinding.priority,
        active: workflowBinding.active,
        label: workflowBinding.label,
      })
      .from(workflowBinding)
      .innerJoin(workflowDefinition, eq(workflowDefinition.id, workflowBinding.definitionId))
      .where(eq(workflowBinding.organizationId, orgId))
      .orderBy(asc(workflowBinding.actionKey), desc(workflowBinding.priority));
    return rows;
  }

  async saveBinding(
    actor: Actor,
    input: {
      id?: string;
      actionKey: string;
      definitionId: string;
      condition?: Record<string, unknown> | null;
      priority?: number;
      label?: string;
      active?: boolean;
    },
  ) {
    const orgId = this.orgOf(actor);
    const action = this.registry.get(input.actionKey);
    if (!action) throw AppError.validation([{ path: 'actionKey', code: 'unknown_action' }]);
    const def = await this.loadDefinition(orgId, input.definitionId);
    if (def.archivedAt)
      throw AppError.businessRule('An archived workflow cannot be bound', {
        reason: 'workflow_archived',
      });
    const [live] = await this.db
      .select({ spec: workflowDefinitionVersion.spec })
      .from(workflowDefinitionVersion)
      .where(
        and(
          eq(workflowDefinitionVersion.definitionId, def.id),
          eq(workflowDefinitionVersion.status, 'published'),
        ),
      )
      .limit(1);
    if (!live)
      throw AppError.businessRule('Publish this workflow before binding it', {
        reason: 'workflow_unpublished',
      });
    if (input.condition) {
      const issues = checkCondition(input.condition, [
        ...action.variables,
        'location',
        'initiator_roles',
      ]);
      if (issues.length)
        throw AppError.businessRule(issues[0]!.message, { reason: 'workflow_condition_invalid' });
    }
    // a pipeline in front of a security-critical action must be able to ask somebody other than its subject
    const issues = await this.validate(orgId, live.spec, [input.actionKey]);
    if (issues.length) {
      throw AppError.businessRule('This workflow has problems for this action', {
        reason: 'workflow_invalid',
        issues: issues as never,
      });
    }
    const values = {
      organizationId: orgId,
      actionKey: input.actionKey,
      definitionId: def.id,
      condition: input.condition ?? null,
      priority: input.priority ?? 0,
      label: input.label ?? null,
      active: input.active ?? true,
    };
    let id = input.id;
    if (id) {
      const [b] = await this.db
        .update(workflowBinding)
        .set({ ...values, updatedBy: actor.accountId, updatedAt: sql`now()` })
        .where(and(eq(workflowBinding.id, id), eq(workflowBinding.organizationId, orgId)))
        .returning({ id: workflowBinding.id });
      if (!b) throw AppError.notFound('binding');
    } else {
      const [b] = await this.db
        .insert(workflowBinding)
        .values({ ...values, createdBy: actor.accountId })
        .returning({ id: workflowBinding.id });
      id = b!.id;
    }
    await this.audit.record({
      action: 'workflow.binding.saved',
      targetType: 'workflow_binding',
      targetId: id,
      actor,
      after: values,
    });
    return (await this.bindings(orgId)).find((b) => b.id === id)!;
  }

  async removeBinding(actor: Actor, id: string) {
    const orgId = this.orgOf(actor);
    const [b] = await this.db
      .delete(workflowBinding)
      .where(and(eq(workflowBinding.id, id), eq(workflowBinding.organizationId, orgId)))
      .returning();
    if (!b) throw AppError.notFound('binding');
    await this.audit.record({
      action: 'workflow.binding.removed',
      targetType: 'workflow_binding',
      targetId: id,
      actor,
      before: { actionKey: b.actionKey, definitionId: b.definitionId },
    });
  }

  // ───────────── simulator ─────────────

  /** "Who would be asked?" — walks the graph with a sample context, without creating anything. */
  async simulate(
    actor: Actor,
    input: {
      spec?: unknown;
      definitionId?: string;
      actionKey?: string;
      context?: Record<string, unknown>;
    },
  ) {
    const orgId = this.orgOf(actor);
    let raw = input.spec;
    if (!raw && input.definitionId) {
      const d = await this.get(orgId, input.definitionId);
      raw = (d.versions.find((v) => v.status === 'published') ?? d.versions[0])?.spec;
    }
    const parsed = zWorkflowSpec.safeParse(raw);
    if (!parsed.success)
      throw AppError.validation(
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
      );
    const spec = parsed.data;
    const context = { location: null, initiator_roles: actor.roleCodes, ...(input.context ?? {}) };
    const ctx = {
      organizationId: orgId,
      initiatorStaffId: actor.staffProfileId ?? null,
      locationCode: (context.location as string | null) ?? null,
    };
    const path: {
      stepId: string;
      name: string;
      type: string;
      asks: { staffProfileId: string; name: string; source: string }[];
      mode?: string;
      required?: number;
      dueHours?: number;
      branch?: string;
    }[] = [];
    let next: string | null = spec.start;
    let hours = 0;
    for (let guard = 0; next !== null && guard < 60; guard++) {
      const step: WorkflowSpec['steps'][string] | undefined = spec.steps[next];
      if (!step) break;
      if (step.type === 'approval' || step.type === 'task') {
        let who = await this.actors.resolve(step.actors.selectors, ctx, {
          excludeInitiator: step.actors.excludeInitiator,
        });
        let fallback = false;
        if (!who.length) {
          who = await this.actors.resolve(spec.fallbackActors, ctx, {});
          fallback = true;
        }
        const names = await this.actors.labels(who.map((w) => w.staffProfileId));
        const n = who.length;
        const required =
          step.actors.mode === 'any'
            ? 1
            : step.actors.mode === 'quorum'
              ? Math.min(step.actors.quorum ?? 1, n)
              : n;
        path.push({
          stepId: step.id,
          name: step.name,
          type: step.type,
          mode: step.actors.mode,
          required,
          ...(step.due ? { dueHours: step.due.hours } : {}),
          asks: who.slice(0, 50).map((w) => ({
            staffProfileId: w.staffProfileId,
            name: names.get(w.staffProfileId) ?? '—',
            source: fallback ? 'fallback' : w.source,
          })),
        });
        hours += step.due?.hours ?? 0;
        next = step.next;
      } else if (step.type === 'condition') {
        const hit = step.branches.findIndex((b) => evaluateCondition(b.when, context));
        path.push({
          stepId: step.id,
          name: step.name,
          type: 'condition',
          asks: [],
          branch: hit >= 0 ? (step.branches[hit]!.label ?? `branch ${hit + 1}`) : 'else',
        });
        next = hit >= 0 ? step.branches[hit]!.next : step.else;
      } else if (step.type === 'wait') {
        path.push({
          stepId: step.id,
          name: step.name,
          type: 'wait',
          asks: [],
          dueHours: step.hours,
        });
        hours += step.hours;
        next = step.next;
      } else if (step.type === 'parallel') {
        path.push({ stepId: step.id, name: step.name, type: 'parallel', asks: [] });
        next = step.next;
      } else {
        path.push({ stepId: step.id, name: step.name, type: 'auto', asks: [] });
        next = step.next;
      }
    }
    return { direct: spec.start === null, path, maxHours: hours };
  }

  // ───────────── seeds ─────────────

  /** The built-in starting points every organisation has. Idempotent. */
  async ensureSystemDefinitions(
    orgId: string,
    specs: { code: string; name: string; description: string; spec: WorkflowSpec }[],
  ): Promise<void> {
    for (const s of specs) {
      const [existing] = await this.db
        .select({ id: workflowDefinition.id })
        .from(workflowDefinition)
        .where(
          and(eq(workflowDefinition.organizationId, orgId), eq(workflowDefinition.code, s.code)),
        )
        .limit(1);
      if (existing) continue;
      await this.db.transaction(async (tx) => {
        const [d] = await tx
          .insert(workflowDefinition)
          .values({
            organizationId: orgId,
            code: s.code,
            name: s.name,
            description: s.description,
            isSystem: true,
          })
          .returning();
        await tx.insert(workflowDefinitionVersion).values({
          definitionId: d!.id,
          revision: 1,
          status: 'published',
          spec: s.spec as unknown as Record<string, unknown>,
          publishedAt: sql`now()`,
        });
      });
    }
  }

  // ───────────── helpers ─────────────

  private orgOf(actor: Actor): string {
    if (!actor.organizationId) throw AppError.forbidden();
    return actor.organizationId;
  }

  private async loadDefinition(orgId: string, id: string) {
    const [def] = await this.db
      .select()
      .from(workflowDefinition)
      .where(and(eq(workflowDefinition.id, id), eq(workflowDefinition.organizationId, orgId)))
      .limit(1);
    if (!def) throw AppError.notFound('workflow');
    return def;
  }
}
