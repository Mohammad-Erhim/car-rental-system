import { Injectable } from '@nestjs/common';

import type { Actor } from '../../common/auth/types';

import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowRegistry } from './workflow-registry.service';
import type { GateInput, GateResult, WorkflowActionDef, WorkflowSummary } from './workflow.types';

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
