import {
  zWorkflowSpec,
  type ActorSelector,
  type WorkflowSpec,
  type WorkflowStep,
} from '@carrental/contracts';

/**
 * The builder's working copy of a workflow. It is the saved spec (`WorkflowSpec`) with one
 * difference that makes editing natural: steps live in an ORDERED LIST, and where a step goes next
 * is optional — absent means "the step after this one in the list", so dragging a step or inserting
 * one never leaves a dangling pointer. `null` is "end", a string is an explicit jump (used by
 * branches). `toSpec` turns it into the saved graph, `fromSpec` reads a saved graph back in.
 */

type Loose<T> = T extends { next: unknown } ? Omit<T, 'next'> & { next?: string | null } : T;

export type EditorStep =
  | Loose<Extract<WorkflowStep, { type: 'approval' }>>
  | Loose<Extract<WorkflowStep, { type: 'task' }>>
  | Loose<Extract<WorkflowStep, { type: 'auto' }>>
  | Loose<Extract<WorkflowStep, { type: 'wait' }>>
  | EditorCondition
  | EditorParallel;

export interface EditorCondition {
  id: string;
  name: string;
  description?: string;
  type: 'condition';
  branches: Array<{ label?: string; when: Record<string, unknown>; next?: string | null }>;
  else?: string | null;
}

/** A step that runs inside a parallel branch — it always ends there. */
export type InlineStep = Extract<EditorStep, { type: 'approval' | 'task' | 'wait' | 'auto' }>;

export interface EditorParallel {
  id: string;
  name: string;
  description?: string;
  type: 'parallel';
  branches: InlineStep[][];
  join: 'all' | 'any';
  next?: string | null;
}

export interface EditorDoc {
  steps: EditorStep[];
  fallbackActors: ActorSelector[];
  maxRevisions: number;
}

export const STEP_TYPES = ['approval', 'task', 'auto', 'condition', 'wait', 'parallel'] as const;
export type StepType = (typeof STEP_TYPES)[number];

const isInlineType = (t: string) =>
  t === 'approval' || t === 'task' || t === 'wait' || t === 'auto';

// ───────────── editor → saved spec ─────────────

export function toSpec(doc: EditorDoc): WorkflowSpec {
  const steps: Record<string, WorkflowStep> = {};
  const main = doc.steps;
  main.forEach((step, i) => {
    const following = main[i + 1]?.id ?? null;
    const target = (t: string | null | undefined) => (t === undefined ? following : t);
    if (step.type === 'condition') {
      steps[step.id] = {
        ...step,
        branches: step.branches.map((b) => ({ ...b, next: target(b.next) })),
        else: target(step.else),
      };
    } else if (step.type === 'parallel') {
      const branches = step.branches.map((branch) => {
        for (const inline of branch) {
          steps[inline.id] = { ...inline, next: null } as WorkflowStep;
        }
        return branch.map((s) => s.id);
      });
      steps[step.id] = { ...step, branches, next: target(step.next) };
    } else {
      steps[step.id] = { ...step, next: target(step.next) } as WorkflowStep;
    }
  });
  return {
    start: main[0]?.id ?? null,
    steps,
    fallbackActors: doc.fallbackActors,
    maxRevisions: doc.maxRevisions,
  };
}

// ───────────── saved spec → editor ─────────────

/**
 * Read a saved graph into the editor. Steps are ordered by walking the graph from its start, so a
 * plain pipeline comes back as a plain list; a step whose next is the following one needs no explicit
 * pointer. Steps nothing reaches are reported in `dropped` (the validator already rejects such
 * a definition, so a saved one has none).
 */
export function fromSpec(spec: WorkflowSpec): { doc: EditorDoc; dropped: string[] } {
  const inline = new Set<string>();
  for (const s of Object.values(spec.steps)) {
    if (s.type === 'parallel') for (const b of s.branches) for (const id of b) inline.add(id);
  }
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string | null) => {
    if (id === null || seen.has(id) || inline.has(id)) return;
    const step = spec.steps[id];
    if (!step) return;
    seen.add(id);
    order.push(id);
    if (step.type === 'condition') {
      for (const b of step.branches) visit(b.next);
      visit(step.else);
    } else {
      visit(step.next);
    }
  };
  visit(spec.start);

  const steps: EditorStep[] = order.map((id, i) => {
    const following = order[i + 1] ?? null;
    const target = (t: string | null) => (t === following ? undefined : t);
    const step = spec.steps[id]!;
    if (step.type === 'condition') {
      return {
        ...step,
        branches: step.branches.map((b) => ({ ...b, next: target(b.next) })),
        else: target(step.else),
      } as EditorCondition;
    }
    if (step.type === 'parallel') {
      return {
        ...step,
        next: target(step.next),
        branches: step.branches.map((b) =>
          b.map((cid) => {
            const { next: _drop, ...rest } = spec.steps[cid] as WorkflowStep & { next?: unknown };
            void _drop;
            return rest as InlineStep;
          }),
        ),
      } as EditorParallel;
    }
    return { ...step, next: target(step.next) } as EditorStep;
  });
  const dropped = Object.keys(spec.steps).filter((id) => !seen.has(id) && !inline.has(id));
  return {
    doc: { steps, fallbackActors: spec.fallbackActors, maxRevisions: spec.maxRevisions },
    dropped,
  };
}

/** Parse untrusted JSON (import, or a stored spec) into a spec with defaults applied. */
export function parseSpec(raw: unknown): { spec: WorkflowSpec } | { error: string } {
  const r = zWorkflowSpec.safeParse(raw);
  if (r.success) return { spec: r.data };
  const first = r.error.issues[0];
  return { error: `${first?.path.join('.') || 'definition'}: ${first?.message ?? 'invalid'}` };
}

// ───────────── editing operations (all immutable) ─────────────

const SLUGS: Record<StepType, string> = {
  approval: 'approve',
  task: 'task',
  auto: 'notify',
  condition: 'route',
  wait: 'wait',
  parallel: 'parallel',
};

export function allStepIds(doc: EditorDoc): Set<string> {
  const ids = new Set<string>();
  for (const s of doc.steps) {
    ids.add(s.id);
    if (s.type === 'parallel') for (const b of s.branches) for (const i of b) ids.add(i.id);
  }
  return ids;
}

export function uniqueId(doc: EditorDoc, base: string): string {
  const ids = allStepIds(doc);
  const stem =
    base
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^[^a-z]+/, 's')
      .slice(0, 34) || 'step';
  if (!ids.has(stem)) return stem;
  for (let n = 2; ; n++) if (!ids.has(`${stem}_${n}`)) return `${stem}_${n}`;
}

const DEFAULT_ACTORS = (roleCode: string) => ({
  selectors: [{ kind: 'role' as const, roleCode }],
  mode: 'any' as const,
  excludeInitiator: false,
  requireLocationScope: false,
});

/** A new step of `type` with sensible defaults. `name` is what the person sees on the card. */
export function newStep(
  doc: EditorDoc,
  type: StepType,
  name: string,
  reviewerRole = 'manager',
): EditorStep {
  const id = uniqueId(doc, SLUGS[type]);
  switch (type) {
    case 'approval':
      return {
        id,
        name,
        type,
        actors: DEFAULT_ACTORS(reviewerRole),
        allowChanges: true,
        requireRejectComment: true,
      };
    case 'task':
      return { id, name, type, actors: DEFAULT_ACTORS(reviewerRole), requireNote: false };
    case 'auto':
      return {
        id,
        name,
        type,
        action: 'notify',
        notify: [{ kind: 'dynamic', source: 'initiator' }],
        message: '',
      };
    case 'wait':
      return { id, name, type, hours: 24, businessHours: false };
    case 'condition':
      return { id, name, type, branches: [{ label: '', when: {} }], else: undefined };
    case 'parallel': {
      const a = {
        ...(newStep({ ...doc }, 'approval', `${name} — A`, reviewerRole) as InlineStep),
        id: `${id}_a`,
      };
      const b = {
        ...(newStep({ ...doc }, 'approval', `${name} — B`, reviewerRole) as InlineStep),
        id: `${id}_b`,
      };
      return { id, name, type, branches: [[a], [b]], join: 'all' };
    }
  }
}

export function insertStep(doc: EditorDoc, step: EditorStep, index = doc.steps.length): EditorDoc {
  const steps = [...doc.steps];
  steps.splice(Math.max(0, Math.min(index, steps.length)), 0, step);
  return { ...doc, steps };
}

export function moveStep(doc: EditorDoc, from: number, to: number): EditorDoc {
  if (from === to || from < 0 || from >= doc.steps.length) return doc;
  const steps = [...doc.steps];
  const [item] = steps.splice(from, 1);
  steps.splice(Math.max(0, Math.min(to, steps.length)), 0, item!);
  return { ...doc, steps };
}

export function replaceStep(doc: EditorDoc, id: string, step: EditorStep): EditorDoc {
  return { ...doc, steps: doc.steps.map((s) => (s.id === id ? step : s)) };
}

/** Remove a step; anything that pointed at it now simply goes to the next step in the list. */
export function removeStep(doc: EditorDoc, id: string): EditorDoc {
  const fix = (t: string | null | undefined) => (t === id ? undefined : t);
  const steps = doc.steps
    .filter((s) => s.id !== id)
    .map((s): EditorStep => {
      if (s.type === 'condition') {
        return {
          ...s,
          branches: s.branches.map((b) => ({ ...b, next: fix(b.next) })),
          else: fix(s.else),
        };
      }
      if (s.type === 'parallel') return { ...s, next: fix(s.next) };
      return { ...s, next: fix(s.next) } as EditorStep;
    });
  return { ...doc, steps };
}

/** A parallel step must keep at least two branches, and every branch at least one step. */
export function isValidParallel(s: EditorParallel): boolean {
  return s.branches.length >= 2 && s.branches.every((b) => b.length >= 1);
}

export const isInline = (s: EditorStep): s is InlineStep => isInlineType(s.type);

/** "Who" as short text for a card, from the selectors and a way to name each one. */
export function selectorLabel(
  sel: ActorSelector,
  names: {
    role: (code: string) => string;
    user: (id: string) => string;
    group: (id: string) => string;
    dynamic: (s: string) => string;
  },
): string {
  switch (sel.kind) {
    case 'role':
      return names.role(sel.roleCode);
    case 'user':
      return names.user(sel.staffProfileId);
    case 'group':
      return names.group(sel.groupId);
    case 'dynamic':
      return names.dynamic(sel.source);
  }
}

/** Key-order-independent JSON, so two specs that mean the same thing compare equal. */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, walk(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** A saved spec run through the schema, so defaults are filled in exactly as the editor's copy has them. */
export function normalizeSpec(spec: unknown): unknown {
  const parsed = zWorkflowSpec.safeParse(spec);
  return parsed.success ? parsed.data : spec;
}
