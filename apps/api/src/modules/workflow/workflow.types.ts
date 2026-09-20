import type { AuditInput } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import type { Database } from '../../database/drizzle';
import type { workflowInstance } from '../../database/schema/workflow';

export type Tx = Database;
export type InstanceRow = typeof workflowInstance.$inferSelect;

/** Who is on record for an applied change. The executor never re-checks the initiator's rights (§4 #23). */
export interface ActorsOfRecord {
  initiatorAccountId: string;
  initiatorLabel: string | null;
  /** every account that approved a step, in order of decision */
  approverAccountIds: string[];
  /** the last decider — the one whose decision released the final step (null for an auto-approved timeout) */
  finalDeciderAccountId: string | null;
  finalDeciderLabel: string | null;
}

export interface ExecuteContext<P = Record<string, unknown>> {
  tx: Tx;
  instance: InstanceRow;
  subjectId: string;
  payload: P;
  actors: ActorsOfRecord;
  /** queue an audit entry; written only if the whole apply commits */
  audit(entry: AuditInput): void;
}

export type ClosedReason =
  | 'rejected'
  | 'withdrawn'
  | 'cancelled'
  | 'changes_requested'
  | 'stale'
  | 'timed_out';

export interface ClosedContext<P = Record<string, unknown>> {
  tx: Tx;
  instance: InstanceRow;
  subjectId: string;
  payload: P;
  reason: ClosedReason;
  comment: string | null;
  actorAccountId: string | null;
  audit(entry: AuditInput): void;
}

export interface CaptureContext<P = Record<string, unknown>> {
  tx: Tx;
  subjectId: string;
  payload: P;
  instanceId: string;
  audit(entry: AuditInput): void;
}

/**
 * A change the system can put a pipeline in front of. Declared in code by the owning domain module
 * (it alone knows how to apply the change), registered at boot, and bound to a definition in the
 * dashboard. Without a binding the action runs directly — nobody is asked.
 */
export interface WorkflowActionDef<P = Record<string, unknown>> {
  key: string;
  subjectType: string;
  /** shown in the builder and the inbox until a translation exists */
  label: string;
  description: string;
  /** names a condition may read (`amount`, `location`, …) — the builder offers exactly these */
  variables: string[];
  /**
   * The subject of the change may never be the one who approves it, whatever a definition says
   * (§4 #26) — for changes to people's own access.
   */
  securityCritical?: boolean;
  /** stable string describing the subject's current content; a change while pending makes the request stale */
  fingerprint(subjectId: string, tx: Tx): Promise<string | null>;
  /** the staff profile that owns the subject (for `subject_owner` actors and the security-critical rule) */
  subjectOwner?(
    subjectId: string,
    tx: Tx,
  ): Promise<{ accountId?: string; staffProfileId?: string } | null>;
  /** the request was captured: mark the subject as pending (e.g. `in_review`) */
  onCaptured?(ctx: CaptureContext<P>): Promise<void>;
  /** apply the approved change. Must be idempotent — a retry after a failure runs it again. */
  execute(ctx: ExecuteContext<P>): Promise<Record<string, unknown> | void>;
  /** the request ended without applying (rejected, withdrawn, sent back, stale) */
  onClosed?(ctx: ClosedContext<P>): Promise<void>;
}

export interface GateInput {
  actionKey: string;
  subjectId: string;
  subjectLabel?: string;
  payload?: Record<string, unknown>;
  /** variables conditions can read; must include only names the action declares */
  context?: Record<string, unknown>;
  locationCode?: string | null;
  actor: Actor;
  /** Idempotency-Key of the request: a retry returns the same instance */
  submitKey?: string | null;
}

export interface WorkflowSummary {
  instanceId: string;
  actionKey: string;
  status: string;
  definitionName: string;
  stepId: string | null;
  stepName: string | null;
  /** display names of who the current step is waiting for (capped) */
  waitingFor: string[];
  waitingForMore: number;
  dueAt: string | null;
  revision: number;
}

export type GateResult =
  | { direct: true }
  | { direct: false; existing: boolean; instanceId: string; summary: WorkflowSummary };
