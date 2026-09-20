import { Injectable } from '@nestjs/common';

import type { Actor } from '../../common/auth/types';

import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowRegistry } from './workflow-registry.service';
import type {
  ActorsOfRecord,
  GateInput,
  GateResult,
  WorkflowActionDef,
  WorkflowSummary,
} from './workflow.types';

/** What a governed endpoint returns while its change waits for approval. */
export interface PendingApproval {
  pendingApproval: true;
  workflow: WorkflowSummary;
  /** a request for this subject was already open — nothing new was started */
  existing: boolean;
}

export { WorkflowMessenger } from './workflow-messenger';
export type {
  ActorsOfRecord,
  ClosedContext,
  ExecuteContext,
  GateResult,
  WorkflowActionDef,
  WorkflowSummary,
} from './workflow.types';

/**
 * What other modules may use from workflows (SRS-ARC-001). A domain module registers the actions it
 * owns, asks `gate()` before applying one, and attaches `summaryFor()` to its own list/record so the
 * screen can show "waiting for Finance".
 */
@Injectable()
export class WorkflowPublic {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly engine: WorkflowEngineService,
  ) {}

  register<P>(def: WorkflowActionDef<P>): void {
    this.registry.register(def);
  }

  gate(input: GateInput): Promise<GateResult> {
    return this.engine.gate(input);
  }

  /**
   * The one call a domain method makes: run `direct` when nothing governs this action (today's
   * behaviour, unchanged), otherwise capture the request and answer `PendingApproval`. The change is
   * then applied by the action's registered executor once every step has passed.
   */
  async govern<T>(input: GateInput, direct: () => Promise<T>): Promise<T | PendingApproval> {
    // Remember what the requester was allowed to do. Their rights were checked when they asked; the
    // executor acts with THAT snapshot (under the approver's name), so nothing is re-checked against
    // today's rights and nothing is granted beyond what the requester could do themselves.
    const requester = {
      permissions: input.actor.permissions,
      roleCodes: input.actor.roleCodes,
      locationScope: input.actor.locationScope,
      permissionConditions: input.actor.permissionConditions,
    };
    const gate = await this.engine.gate({
      ...input,
      payload: { ...(input.payload ?? {}), _requester: requester },
    });
    if (gate.direct) return direct();
    return { pendingApproval: true, workflow: gate.summary, existing: gate.existing };
  }

  /**
   * An `Actor` for the executor to act as: the person who made the final decision (or, for an
   * automatic step, the requester) — attribution and audit stay truthful, and the executor does not
   * re-check the requester's permissions (they were checked when the request was made).
   */
  asActor(actors: ActorsOfRecord, organizationId?: string, payload?: unknown): Actor {
    const snap = (payload as { _requester?: Partial<Actor> } | undefined)?._requester;
    return {
      accountId: actors.finalDeciderAccountId ?? actors.initiatorAccountId,
      kind: 'staff',
      audience: 'staff',
      displayName: actors.finalDeciderLabel ?? actors.initiatorLabel ?? 'Workflow',
      localeCode: 'en',
      organizationId,
      permissions: snap?.permissions ?? [],
      roleCodes: snap?.roleCodes ?? [],
      locationScope: snap?.locationScope ?? [],
      permissionConditions: snap?.permissionConditions ?? {},
      tokenId: 'workflow',
    };
  }

  /** Act on the subject's open request (approve/reject) — `null` if there is none. */
  actOnOpen(input: {
    actor: Actor;
    actionKey: string;
    subjectId: string;
    decision: 'approve' | 'reject';
    comment?: string;
    strict?: boolean;
  }): Promise<WorkflowSummary | null> {
    return this.engine.decideForSubject(input);
  }

  /** The open request (if any) on each of these subjects. */
  summaryFor(
    actor: Actor,
    subjectType: string,
    ids: string[],
  ): Promise<Map<string, WorkflowSummary>> {
    if (!actor.organizationId) return Promise.resolve(new Map());
    return this.engine.summaryForSubjects(actor.organizationId, subjectType, ids);
  }
}
