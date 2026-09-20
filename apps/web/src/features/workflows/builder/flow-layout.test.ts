import { describe, expect, it } from 'vitest';

import { layoutFlow } from './flow-layout';
import { toSpec, insertStep, newStep, type EditorDoc } from './model';
import { templateDoc } from './templates';

const empty: EditorDoc = {
  steps: [],
  fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  maxRevisions: 3,
};
const col = (flow: ReturnType<typeof layoutFlow>, id: string) =>
  flow.nodes.find((n) => n.id === id)!.column;

describe('layoutFlow', () => {
  it('a direct workflow is start → end', () => {
    const f = layoutFlow(toSpec(empty));
    expect(f.nodes.map((n) => n.type)).toEqual(['start', 'end']);
    expect(f.edges).toEqual([{ from: '__start__', to: '__end__' }]);
  });

  it('a chain runs left to right in order', () => {
    const f = layoutFlow(toSpec(templateDoc('managerThenFinance')));
    const steps = f.nodes.filter((n) => n.type === 'approval');
    expect(steps.map((s) => s.column)).toEqual([1, 2]);
    expect(col(f, '__end__')).toBe(3);
    expect(f.rows).toBe(1);
  });

  it('a branch puts alternatives in the same column, and a re-join lines up after the longest route', () => {
    let doc = empty;
    doc = insertStep(doc, { ...newStep(doc, 'condition', 'Route'), id: 'route' });
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'Big'), id: 'big' });
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'Small'), id: 'small' });
    doc = insertStep(doc, { ...newStep(doc, 'wait', 'Then'), id: 'then' });
    doc = {
      ...doc,
      steps: doc.steps.map((s) =>
        s.id === 'route' && s.type === 'condition'
          ? {
              ...s,
              branches: [{ label: 'large', when: { '>': [{ var: 'a' }, 1] }, next: 'big' }],
              else: 'small',
            }
          : s.id === 'big'
            ? { ...s, next: 'then' }
            : s.id === 'small'
              ? { ...s, next: 'then' }
              : s,
      ),
    };
    const f = layoutFlow(toSpec(doc));
    expect(col(f, 'big')).toBe(col(f, 'small'));
    expect(col(f, 'then')).toBe(col(f, 'big') + 1);
    expect(f.rows).toBe(2);
    expect(f.edges.find((e) => e.from === 'route' && e.to === 'big')?.label).toBe('large');
  });

  it('parallel routes become lanes that join before the next step', () => {
    let doc = empty;
    doc = insertStep(doc, { ...newStep(doc, 'parallel', 'Both'), id: 'both' });
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'After'), id: 'after' });
    const f = layoutFlow(toSpec(doc));
    const inline = f.nodes.filter((n) => n.inline);
    expect(inline).toHaveLength(2);
    expect(inline[0]!.column).toBe(inline[1]!.column);
    expect(col(f, 'after')).toBe(inline[0]!.column + 1);
  });

  it('never hangs on a broken definition that loops', () => {
    const spec = toSpec(templateDoc('managerThenFinance'));
    const ids = Object.keys(spec.steps);
    (spec.steps[ids[1]!] as { next: string | null }).next = ids[0]!;
    expect(layoutFlow(spec).nodes.length).toBeGreaterThan(1);
  });
});
