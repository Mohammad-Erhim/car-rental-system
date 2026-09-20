import { z } from 'zod';

/**
 * Workflow definitions (docs/ai-delivery/04-implementation/plan-workflows-roles-permissions.md §2.4).
 *
 * A definition is a small directed graph, stored as JSON and authored in the dashboard. This module
 * is the single description of that graph: the API validates and runs it, the dashboard builds and
 * previews it. It has no runtime dependencies beyond zod so both sides import the same rules.
 *
 * Shape: `{ start, steps, fallbackActors, maxRevisions }`. `start: null` (no steps) is the built-in
 * **Direct** definition — the action is applied immediately, nobody is asked.
 */

const SLUG = /^[a-z][a-z0-9_-]{0,39}$/;
export const zStepId = z.string().regex(SLUG, 'Use lowercase letters, digits, - or _');

/** Who is asked. Roles are addressed by their stable code, people and teams by id. */
export const zActorSelector = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), roleCode: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('user'), staffProfileId: z.string().uuid() }),
  z.object({ kind: z.literal('group'), groupId: z.string().uuid() }),
  /** Resolved per request: `initiator` = whoever started it, `subject_owner` = who created the record. */
  z.object({ kind: z.literal('dynamic'), source: z.enum(['initiator', 'subject_owner']) }),
]);
export type ActorSelector = z.infer<typeof zActorSelector>;

export const ACTOR_MODES = ['any', 'all', 'quorum', 'sequence'] as const;
export type ActorMode = (typeof ACTOR_MODES)[number];

export const zActors = z
  .object({
    selectors: z.array(zActorSelector).min(1).max(50),
    /** any = the first decision settles the step; all = everyone; quorum = N of them; sequence = in list order */
    mode: z.enum(ACTOR_MODES).default('any'),
    quorum: z.number().int().min(1).max(200).optional(),
    /** the person who started the request may not decide it (off by default) */
    excludeInitiator: z.boolean().default(false),
    /** only people whose location scope covers the record may decide (org-wide people always pass) */
    requireLocationScope: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'quorum' && !v.quorum) {
      ctx.addIssue({ code: 'custom', path: ['quorum'], message: 'A quorum step needs a number' });
    }
  });
export type Actors = z.infer<typeof zActors>;

export const TIMEOUT_ACTIONS = ['wait', 'escalate', 'approve', 'reject'] as const;
export const zDue = z.object({
  hours: z
    .number()
    .positive()
    .max(24 * 90),
  reminderEveryHours: z
    .number()
    .positive()
    .max(24 * 30)
    .optional(),
  maxReminders: z.number().int().min(0).max(20).default(3),
  /** count only the hours the request's location is open (its opening hours and closures) */
  businessHours: z.boolean().default(false),
  /** what happens once the deadline passes */
  onTimeout: z.enum(TIMEOUT_ACTIONS).default('escalate'),
  /** who is also asked on escalation; defaults to the definition's fallback actors */
  escalateTo: z.array(zActorSelector).max(50).optional(),
});
export type Due = z.infer<typeof zDue>;

const base = {
  id: zStepId,
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
};
const next = { next: zStepId.nullable().default(null) };

export const zApprovalStep = z.object({
  ...base,
  type: z.literal('approval'),
  actors: zActors,
  /** may the approver send it back to the requester for changes */
  allowChanges: z.boolean().default(true),
  /** may the requester withdraw the request while this step is open (a monitor can always cancel) */
  allowWithdraw: z.boolean().default(true),
  requireRejectComment: z.boolean().default(true),
  due: zDue.optional(),
  ...next,
});
export const zTaskStep = z.object({
  ...base,
  type: z.literal('task'),
  actors: zActors,
  /** the person marking it done must leave a note */
  requireNote: z.boolean().default(false),
  allowWithdraw: z.boolean().default(true),
  due: zDue.optional(),
  ...next,
});
export const zAutoStep = z.object({
  ...base,
  type: z.literal('auto'),
  /** `notify` tells the selected people (in-app + email); `noop` only marks a point in the history */
  action: z.enum(['notify', 'noop']).default('notify'),
  notify: z.array(zActorSelector).max(50).optional(),
  message: z.string().max(500).optional(),
  ...next,
});
export const zConditionStep = z.object({
  ...base,
  type: z.literal('condition'),
  /** first matching branch wins; `else` is required so no route is ever a dead end */
  branches: z
    .array(
      z.object({
        label: z.string().max(80).optional(),
        when: z.record(z.unknown()),
        next: zStepId.nullable(),
      }),
    )
    .min(1)
    .max(20),
  else: zStepId.nullable(),
});
export const zWaitStep = z.object({
  ...base,
  type: z.literal('wait'),
  hours: z
    .number()
    .positive()
    .max(24 * 90),
  /** count only the hours the request's location is open */
  businessHours: z.boolean().default(false),
  ...next,
});
export const zParallelStep = z.object({
  ...base,
  type: z.literal('parallel'),
  /** each branch is an ordered list of inline approval / task / wait / auto steps */
  branches: z.array(z.array(zStepId).min(1).max(20)).min(2).max(10),
  /** all = wait for every branch, any = the first finished branch releases the join */
  join: z.enum(['all', 'any']).default('all'),
  ...next,
});

export const zWorkflowStep = z.discriminatedUnion('type', [
  zApprovalStep,
  zTaskStep,
  zAutoStep,
  zConditionStep,
  zWaitStep,
  zParallelStep,
]);
export type WorkflowStep = z.infer<typeof zWorkflowStep>;
export type WorkflowStepType = WorkflowStep['type'];
export type ApprovalStep = z.infer<typeof zApprovalStep>;
export type TaskStep = z.infer<typeof zTaskStep>;

export const zWorkflowSpec = z.object({
  /** first step; `null` = the Direct definition (apply immediately) */
  start: zStepId.nullable(),
  steps: z.record(zStepId, zWorkflowStep).default({}),
  /** asked whenever a step has nobody able to act — mandatory so a request can never dead-end */
  fallbackActors: z.array(zActorSelector).min(1).max(50),
  /** how many times a request may be sent back for changes before it is closed */
  maxRevisions: z.number().int().min(0).max(10).default(3),
});
export type WorkflowSpec = z.infer<typeof zWorkflowSpec>;

export interface WorkflowIssue {
  /** machine-readable, stable — the builder maps these to translated messages */
  code: string;
  stepId?: string;
  message: string;
}

const INLINE_TYPES = new Set<WorkflowStepType>(['approval', 'task', 'wait', 'auto']);

/** Every step id a step may hand control to (parallel branches are inline, not "next"). */
export function stepTargets(step: WorkflowStep): (string | null)[] {
  switch (step.type) {
    case 'condition':
      return [...step.branches.map((b) => b.next), step.else];
    default:
      return [step.next];
  }
}

/** The steps that only exist inside a parallel step's branches. */
export function inlineStepIds(spec: WorkflowSpec): Set<string> {
  const ids = new Set<string>();
  for (const s of Object.values(spec.steps)) {
    if (s.type === 'parallel') for (const b of s.branches) for (const id of b) ids.add(id);
  }
  return ids;
}

/**
 * Structural checks that need no database: every reference resolves, everything is reachable, the
 * graph ends, and it cannot loop. (Whether each actor list resolves to real, active people is
 * checked separately by the API, which can see them.) Returns every problem, not just the first,
 * so the builder can mark all offending steps at once.
 */
export function validateWorkflowGraph(spec: WorkflowSpec): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const issue = (code: string, message: string, stepId?: string) =>
    issues.push({ code, message, ...(stepId ? { stepId } : {}) });
  const steps = spec.steps;
  const ids = Object.keys(steps);

  for (const [key, step] of Object.entries(steps)) {
    if (step.id !== key)
      issue('step_id_mismatch', `Step "${key}" is stored under a different id`, key);
  }

  if (spec.start === null) {
    if (ids.length) issue('orphan_steps', 'A definition with no start step cannot have steps');
    return issues;
  }
  if (!steps[spec.start]) {
    issue('missing_start', `The start step "${spec.start}" does not exist`);
    return issues;
  }

  const inline = inlineStepIds(spec);
  const seenInline = new Map<string, number>();
  for (const s of Object.values(steps)) {
    if (s.type !== 'parallel') continue;
    for (const branch of s.branches) {
      for (const id of branch) {
        seenInline.set(id, (seenInline.get(id) ?? 0) + 1);
        const target = steps[id];
        if (!target)
          issue(
            'missing_step',
            `Parallel step "${s.id}" points at "${id}", which does not exist`,
            s.id,
          );
        else if (!INLINE_TYPES.has(target.type))
          issue(
            'bad_parallel_child',
            `"${id}" (${target.type}) cannot run inside a parallel branch`,
            s.id,
          );
        else if (target.type !== 'condition' && 'next' in target && target.next !== null)
          issue(
            'parallel_child_next',
            `"${id}" runs inside a parallel branch, so it must end there (next = end)`,
            id,
          );
      }
    }
  }
  for (const [id, n] of seenInline) {
    if (n > 1)
      issue('duplicate_parallel_child', `"${id}" appears in more than one parallel branch`, id);
  }

  for (const step of Object.values(steps)) {
    for (const t of stepTargets(step)) {
      if (t === null) continue;
      if (!steps[t])
        issue('missing_step', `"${step.id}" points at "${t}", which does not exist`, step.id);
      else if (inline.has(t))
        issue(
          'inline_target',
          `"${t}" belongs to a parallel branch and cannot be a next step`,
          step.id,
        );
    }
    if (step.type === 'approval' || step.type === 'task') {
      if (
        step.actors.mode === 'quorum' &&
        step.actors.quorum &&
        step.actors.selectors.length === 1 &&
        step.actors.selectors[0]!.kind === 'user' &&
        step.actors.quorum > 1
      ) {
        issue(
          'quorum_too_high',
          `"${step.id}" needs ${step.actors.quorum} people but names only one`,
          step.id,
        );
      }
      if (
        step.due?.onTimeout === 'escalate' &&
        !step.due.escalateTo &&
        spec.fallbackActors.length === 0
      ) {
        issue(
          'no_escalation_target',
          `"${step.id}" escalates but nobody is set to escalate to`,
          step.id,
        );
      }
    }
  }

  // reachability (over "next" edges + parallel children) and cycle detection (DFS colouring)
  const reachable = new Set<string>();
  const colour = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, trail: string[]) => {
    const step = steps[id];
    if (!step) return;
    if (colour.get(id) === 1) {
      issue('cycle', `The route loops back to "${id}" (${[...trail, id].join(' → ')})`, id);
      return;
    }
    if (colour.get(id) === 2) return;
    colour.set(id, 1);
    reachable.add(id);
    if (step.type === 'parallel') {
      for (const b of step.branches) for (const c of b) reachable.add(c);
    }
    for (const t of stepTargets(step)) if (t !== null) visit(t, [...trail, id]);
    colour.set(id, 2);
  };
  visit(spec.start, []);
  for (const id of ids) {
    if (!reachable.has(id)) issue('unreachable', `"${id}" can never be reached from the start`, id);
  }

  // every path must be able to end (a graph whose every branch loops is already caught as a cycle;
  // this catches a condition/parallel with no way out because all targets are missing)
  let canEnd = false;
  const endSeen = new Set<string>();
  const walk = (id: string | null) => {
    if (canEnd) return;
    if (id === null) {
      canEnd = true;
      return;
    }
    if (endSeen.has(id)) return;
    endSeen.add(id);
    const s = steps[id];
    if (s) for (const t of stepTargets(s)) walk(t);
  };
  walk(spec.start);
  if (!canEnd) issue('no_end', 'No route reaches the end of the workflow');

  return issues;
}

/** The two starting points every organisation gets. */
export const DIRECT_WORKFLOW: WorkflowSpec = {
  start: null,
  steps: {},
  fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  maxRevisions: 3,
};

export function twoPersonReviewSpec(reviewerRoleCode: string): WorkflowSpec {
  return {
    start: 'review',
    steps: {
      review: {
        id: 'review',
        name: 'Second-person review',
        type: 'approval',
        actors: {
          selectors: [{ kind: 'role', roleCode: reviewerRoleCode }],
          mode: 'any',
          excludeInitiator: true,
          requireLocationScope: false,
        },
        allowChanges: true,
        requireRejectComment: true,
        allowWithdraw: true,
        next: null,
      },
    },
    fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
    maxRevisions: 3,
  };
}

// ---------- API request / response shapes ----------

export const zWorkflowDecision = z.object({
  decision: z.enum(['approve', 'reject', 'request_changes', 'complete']),
  comment: z.string().max(2000).optional(),
});
export type WorkflowDecisionInput = z.infer<typeof zWorkflowDecision>;

export const WORKFLOW_INSTANCE_STATUSES = [
  'running',
  'applying',
  'apply_failed',
  'completed',
  'rejected',
  'withdrawn',
  'cancelled',
  'changes_requested',
  'stale',
] as const;
export type WorkflowInstanceStatus = (typeof WORKFLOW_INSTANCE_STATUSES)[number];
/** statuses in which an instance still holds its subject */
export const OPEN_WORKFLOW_STATUSES: readonly WorkflowInstanceStatus[] = [
  'running',
  'applying',
  'apply_failed',
];
