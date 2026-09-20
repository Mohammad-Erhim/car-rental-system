import { describe, expect, it } from 'vitest';

import {
  DIRECT_WORKFLOW,
  twoPersonReviewSpec,
  validateWorkflowGraph,
  zWorkflowSpec,
  type WorkflowSpec,
} from './workflow';

const actors = {
  selectors: [{ kind: 'role' as const, roleCode: 'manager' }],
  mode: 'any' as const,
  excludeInitiator: false,
  requireLocationScope: false,
};
const approval = (id: string, next: string | null) => ({
  id,
  name: id,
  type: 'approval' as const,
  actors,
  allowChanges: true,
  requireRejectComment: true,
  allowWithdraw: true,
  next,
});
const spec = (over: Partial<WorkflowSpec>): WorkflowSpec => ({
  start: 'a',
  steps: {},
  fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  maxRevisions: 3,
  ...over,
});
const codes = (s: WorkflowSpec) => validateWorkflowGraph(s).map((i) => i.code);

describe('workflow definition graph', () => {
  it('accepts the built-in Direct and two-person definitions', () => {
    expect(validateWorkflowGraph(DIRECT_WORKFLOW)).toEqual([]);
    const two = twoPersonReviewSpec('manager');
    expect(zWorkflowSpec.safeParse(two).success).toBe(true);
    expect(validateWorkflowGraph(two)).toEqual([]);
  });

  it('accepts a linear pipeline and a branching one', () => {
    expect(codes(spec({ steps: { a: approval('a', 'b'), b: approval('b', null) } }))).toEqual([]);
    expect(
      codes(
        spec({
          steps: {
            a: {
              id: 'a',
              name: 'a',
              type: 'condition',
              branches: [{ when: { '>': [{ var: 'amount' }, 500] }, next: 'f' }],
              else: null,
            },
            f: approval('f', null),
          },
        }),
      ),
    ).toEqual([]);
  });

  it('flags a missing start, missing targets, orphans and cycles', () => {
    expect(codes(spec({ start: 'zzz', steps: { a: approval('a', null) } }))).toContain(
      'missing_start',
    );
    expect(codes(spec({ steps: { a: approval('a', 'nope') } }))).toContain('missing_step');
    expect(codes(spec({ steps: { a: approval('a', null), b: approval('b', null) } }))).toContain(
      'unreachable',
    );
    expect(codes(spec({ steps: { a: approval('a', 'b'), b: approval('b', 'a') } }))).toContain(
      'cycle',
    );
  });

  it('a direct definition cannot carry steps', () => {
    expect(codes(spec({ start: null, steps: { a: approval('a', null) } }))).toContain(
      'orphan_steps',
    );
  });

  it('validates parallel branches', () => {
    const p = spec({
      steps: {
        p: {
          id: 'p',
          name: 'p',
          type: 'parallel',
          branches: [['x'], ['y']],
          join: 'all',
          next: null,
        },
        x: approval('x', null),
        y: approval('y', null),
      },
      start: 'p',
    });
    expect(codes(p)).toEqual([]);
    const bad = spec({ ...p, steps: { ...p.steps, x: approval('x', 'y') } });
    expect(codes(bad)).toContain('parallel_child_next');
  });

  it('rejects a quorum step without a number and a bad slug', () => {
    const q = { ...actors, mode: 'quorum' as const };
    expect(
      zWorkflowSpec.safeParse(spec({ steps: { a: { ...approval('a', null), actors: q } } }))
        .success,
    ).toBe(false);
    expect(
      zWorkflowSpec.safeParse(spec({ steps: { 'Bad Id': approval('Bad Id', null) } })).success,
    ).toBe(false);
  });
});
