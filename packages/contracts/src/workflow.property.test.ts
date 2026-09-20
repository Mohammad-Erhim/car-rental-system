import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  validateWorkflowGraph,
  zWorkflowSpec,
  type WorkflowSpec,
  type WorkflowStep,
} from './workflow';

const actors = {
  selectors: [{ kind: 'role' as const, roleCode: 'manager' }],
  mode: 'any' as const,
  excludeInitiator: false,
  requireLocationScope: false,
};
const FALLBACK = [{ kind: 'role' as const, roleCode: 'administrator' }];

/**
 * A random, VALID pipeline: steps s0…s(n-1), every pointer goes strictly forward (or ends), so the
 * graph can branch and re-join but can never loop. Some steps are approvals, waits, conditions with
 * several branches, or parallel steps with inline children.
 */
const specArb: fc.Arbitrary<WorkflowSpec> = fc
  .integer({ min: 1, max: 7 })
  .chain((n) =>
    fc.tuple(
      fc.constant(n),
      fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }), // step kind
      fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: n * 4, maxLength: n * 4 }), // pointer entropy
    ),
  )
  .map(([n, kinds, entropy]) => {
    const steps: Record<string, WorkflowStep> = {};
    const pick = (i: number, k: number): string | null => {
      // strictly forward: a later step, or the end
      const options: (string | null)[] = [
        null,
        ...Array.from({ length: n - i - 1 }, (_, j) => `s${i + 1 + j}`),
      ];
      return options[entropy[i * 4 + k]! % options.length]!;
    };
    for (let i = 0; i < n; i++) {
      const id = `s${i}`;
      const base = { id, name: id };
      const kind = kinds[i]!;
      if (kind === 0)
        steps[id] = {
          ...base,
          type: 'approval',
          actors,
          allowChanges: true,
          requireRejectComment: true,
          next: i === n - 1 ? null : pick(i, 0),
        } as WorkflowStep;
      else if (kind === 1)
        steps[id] = {
          ...base,
          type: 'wait',
          hours: 1,
          next: i === n - 1 ? null : pick(i, 0),
        } as WorkflowStep;
      else if (kind === 2)
        steps[id] = {
          ...base,
          type: 'condition',
          branches: [
            { when: { '>': [{ var: 'a' }, 1] }, next: i === n - 1 ? null : pick(i, 0) },
            { when: { '==': [{ var: 'b' }, 'x'] }, next: i === n - 1 ? null : pick(i, 1) },
          ],
          else: i === n - 1 ? null : pick(i, 2),
        } as WorkflowStep;
      else {
        steps[`${id}_a`] = {
          id: `${id}_a`,
          name: 'a',
          type: 'approval',
          actors,
          allowChanges: true,
          requireRejectComment: true,
          next: null,
        } as WorkflowStep;
        steps[`${id}_b`] = {
          id: `${id}_b`,
          name: 'b',
          type: 'wait',
          hours: 1,
          next: null,
        } as WorkflowStep;
        steps[id] = {
          ...base,
          type: 'parallel',
          branches: [[`${id}_a`], [`${id}_b`]],
          join: 'all',
          next: i === n - 1 ? null : pick(i, 0),
        } as WorkflowStep;
      }
    }
    return { start: 's0', steps, fallbackActors: FALLBACK, maxRevisions: 3 } as WorkflowSpec;
  })
  // steps nothing points at would be flagged unreachable — keep only specs where all are reachable
  .filter((spec) => validateWorkflowGraph(spec).every((i) => i.code !== 'unreachable'));

/** Walk the main route choosing branches with `choose`; returns how many steps it visited, or null if it never ended. */
function walk(spec: WorkflowSpec, choose: (n: number) => number): number | null {
  let id: string | null = spec.start;
  for (let visited = 0; visited <= Object.keys(spec.steps).length + 1; visited++) {
    if (id === null) return visited;
    const step: WorkflowStep = spec.steps[id]!;
    if (step.type === 'condition') {
      const targets = [...step.branches.map((b) => b.next), step.else];
      id = targets[choose(targets.length)]!;
    } else id = step.next;
  }
  return null;
}

describe('workflow definitions — properties', () => {
  it('every forward-only pipeline is valid, parses, and can never dead-end', () => {
    fc.assert(
      fc.property(specArb, fc.array(fc.nat(), { minLength: 1, maxLength: 20 }), (spec, seeds) => {
        expect(validateWorkflowGraph(spec)).toEqual([]);
        expect(zWorkflowSpec.safeParse(spec).success).toBe(true);
        // whatever the branches decide, the request reaches its end within as many steps as there are
        for (const seed of seeds) {
          let k = seed;
          const visited = walk(spec, (len) => (k = (k * 31 + 7) % 9973) % len);
          expect(visited).not.toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('adding a route back to an earlier step is always caught as a loop', () => {
    fc.assert(
      fc.property(
        specArb.filter((s) =>
          Object.values(s.steps).some((x) => x.type === 'approval' && !x.id.includes('_')),
        ),
        (spec) => {
          const ids = Object.keys(spec.steps).filter((i) => !i.includes('_'));
          // point the LAST main step back at the first
          const last = ids[ids.length - 1]!;
          const lastStep = spec.steps[last]!;
          fc.pre(lastStep.type === 'approval' || lastStep.type === 'wait');
          fc.pre(last !== spec.start);
          const looped = structuredClone(spec);
          (looped.steps[last] as { next: string | null }).next = spec.start;
          const issues = validateWorkflowGraph(looped);
          expect(issues.some((i) => i.code === 'cycle')).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a pointer to a step that does not exist is always caught', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const broken = structuredClone(spec);
        const main = Object.values(broken.steps).find(
          (s) => s.type === 'approval' || s.type === 'wait',
        );
        fc.pre(!!main);
        (main as { next: string | null }).next = 'ghost';
        expect(validateWorkflowGraph(broken).some((i) => i.code === 'missing_step')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
