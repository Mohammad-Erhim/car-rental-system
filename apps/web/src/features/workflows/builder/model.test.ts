import { validateWorkflowGraph, type WorkflowSpec } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import { diffSpecs } from './diff';
import {
  fromSpec,
  insertStep,
  moveStep,
  newStep,
  parseSpec,
  removeStep,
  toSpec,
  uniqueId,
  type EditorDoc,
} from './model';
import { describeRule, emptyRule, fromJsonLogic, toJsonLogic } from './rule';
import { TEMPLATE_IDS, templateDoc } from './templates';

const empty: EditorDoc = {
  steps: [],
  fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  maxRevisions: 3,
};

describe('editor model ↔ saved spec', () => {
  it('an empty editor is the Direct definition', () => {
    const spec = toSpec(empty);
    expect(spec.start).toBeNull();
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('a list of steps becomes a chain; the last one ends', () => {
    let doc = empty;
    doc = insertStep(doc, newStep(doc, 'approval', 'A'));
    doc = insertStep(doc, newStep(doc, 'approval', 'B'));
    doc = insertStep(doc, newStep(doc, 'wait', 'C'));
    const spec = toSpec(doc);
    const ids = doc.steps.map((s) => s.id);
    expect(spec.start).toBe(ids[0]);
    expect((spec.steps[ids[0]!] as { next: string }).next).toBe(ids[1]);
    expect((spec.steps[ids[2]!] as { next: string | null }).next).toBeNull();
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('reordering rewires the chain with no dangling pointers', () => {
    let doc = empty;
    for (const n of ['A', 'B', 'C']) doc = insertStep(doc, newStep(doc, 'approval', n));
    const [a, b, c] = doc.steps.map((s) => s.id) as [string, string, string];
    const moved = moveStep(doc, 2, 0);
    const spec = toSpec(moved);
    expect(spec.start).toBe(c);
    expect((spec.steps[c] as { next: string }).next).toBe(a);
    expect((spec.steps[b] as { next: string | null }).next).toBeNull();
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('removing a step sends whatever pointed at it to the next one', () => {
    let doc = empty;
    for (const n of ['A', 'B', 'C']) doc = insertStep(doc, newStep(doc, 'approval', n));
    const [a, b, c] = doc.steps.map((s) => s.id) as [string, string, string];
    const spec = toSpec(removeStep(doc, b));
    expect((spec.steps[a] as { next: string }).next).toBe(c);
    expect(spec.steps[b]).toBeUndefined();
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('a condition jumps where it says, and "the next step" stays relative', () => {
    let doc = empty;
    const cond = { ...newStep(doc, 'condition', 'Route'), id: 'route' };
    doc = insertStep(doc, cond);
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'Big'), id: 'big' });
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'Small'), id: 'small' });
    doc = {
      ...doc,
      steps: doc.steps.map((s) =>
        s.type === 'condition'
          ? {
              ...s,
              branches: [{ when: { '>': [{ var: 'amount' }, 500] }, next: undefined }],
              else: 'small',
            }
          : s,
      ),
    };
    const spec = toSpec(doc);
    const route = spec.steps.route as {
      branches: Array<{ next: string | null }>;
      else: string | null;
    };
    expect(route.branches[0]!.next).toBe('big'); // "the next step in the list"
    expect(route.else).toBe('small'); // explicit jump over "big"
    expect((spec.steps.big as { next: string | null }).next).toBe('small');
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('a parallel step keeps its branches and their steps inline', () => {
    let doc = empty;
    doc = insertStep(doc, newStep(doc, 'parallel', 'Both'));
    doc = insertStep(doc, newStep(doc, 'approval', 'After'));
    const spec = toSpec(doc);
    const par = doc.steps[0]!.id;
    const p = spec.steps[par] as { branches: string[][]; next: string };
    expect(p.branches).toHaveLength(2);
    expect(p.next).toBe(doc.steps[1]!.id);
    for (const id of p.branches.flat())
      expect((spec.steps[id] as { next: string | null }).next).toBeNull();
    expect(validateWorkflowGraph(spec)).toEqual([]);
  });

  it('round-trips: fromSpec(toSpec(doc)) saves back to the same graph', () => {
    for (const id of TEMPLATE_IDS) {
      const spec = toSpec(templateDoc(id));
      const again = toSpec(fromSpec(spec).doc);
      expect(again).toEqual(spec);
    }
    let doc = empty;
    doc = insertStep(doc, { ...newStep(doc, 'condition', 'Route'), id: 'route' });
    doc = insertStep(doc, { ...newStep(doc, 'parallel', 'Both'), id: 'both' });
    doc = insertStep(doc, { ...newStep(doc, 'approval', 'Last'), id: 'last' });
    const spec = toSpec(doc);
    expect(toSpec(fromSpec(spec).doc)).toEqual(spec);
  });

  it('every template is a valid, saveable graph', () => {
    for (const id of TEMPLATE_IDS) {
      const spec = toSpec(templateDoc(id));
      expect(parseSpec(spec)).toHaveProperty('spec');
      expect(validateWorkflowGraph(spec)).toEqual([]);
    }
  });

  it('fromSpec reports steps nothing reaches instead of losing them silently', () => {
    const spec: WorkflowSpec = {
      start: 'a',
      steps: {
        a: { id: 'a', name: 'A', type: 'wait', hours: 1, businessHours: false, next: null },
        z: { id: 'z', name: 'Z', type: 'wait', hours: 1, businessHours: false, next: null },
      },
      fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      maxRevisions: 3,
    };
    expect(fromSpec(spec).dropped).toEqual(['z']);
  });

  it('generates unique, valid step ids', () => {
    let doc = empty;
    doc = insertStep(doc, newStep(doc, 'approval', 'A'));
    doc = insertStep(doc, newStep(doc, 'approval', 'B'));
    expect(new Set(doc.steps.map((s) => s.id)).size).toBe(2);
    expect(uniqueId(doc, '1 bad Name!')).toMatch(/^[a-z][a-z0-9_-]*$/);
  });

  it('parseSpec rejects garbage with a readable reason', () => {
    expect(parseSpec({ start: 5 })).toHaveProperty('error');
    expect(parseSpec('nope')).toHaveProperty('error');
  });
});

describe('rules', () => {
  it('a single comparison round-trips', () => {
    const form = {
      combinator: 'and' as const,
      rows: [{ variable: 'amount', op: '>' as const, value: '500' }],
    };
    const rule = toJsonLogic(form);
    expect(rule).toEqual({ '>': [{ var: 'amount' }, 500] });
    expect(fromJsonLogic(rule)).toEqual(form);
  });

  it('several comparisons join with AND / OR, and "in" takes a list', () => {
    const form = {
      combinator: 'or' as const,
      rows: [
        { variable: 'kind', op: '==' as const, value: 'policy' },
        { variable: 'location', op: 'in' as const, value: 'LHR, JFK' },
      ],
    };
    const rule = toJsonLogic(form);
    expect(rule).toEqual({
      or: [{ '==': [{ var: 'kind' }, 'policy'] }, { in: [{ var: 'location' }, ['LHR', 'JFK']] }],
    });
    expect(fromJsonLogic(rule)).toEqual({
      combinator: 'or',
      rows: [form.rows[0], { ...form.rows[1], value: 'LHR, JFK' }],
    });
  });

  it('numbers and booleans are typed, text stays text', () => {
    expect(
      toJsonLogic({ combinator: 'and', rows: [{ variable: 'x', op: '==', value: 'true' }] }),
    ).toEqual({ '==': [{ var: 'x' }, true] });
    expect(
      toJsonLogic({ combinator: 'and', rows: [{ variable: 'x', op: '==', value: '007' }] }),
    ).toEqual({ '==': [{ var: 'x' }, 7] });
    expect(
      toJsonLogic({ combinator: 'and', rows: [{ variable: 'x', op: '==', value: 'abc' }] }),
    ).toEqual({ '==': [{ var: 'x' }, 'abc'] });
  });

  it('rows with no variable are ignored; a rule the form cannot show comes back null', () => {
    expect(toJsonLogic(emptyRule())).toEqual({});
    expect(fromJsonLogic({ if: [1, 2, 3] })).toBeNull();
    expect(fromJsonLogic({ '>': [{ var: 'a' }, { var: 'b' }] })).toBeNull();
    expect(fromJsonLogic({})).toEqual(emptyRule());
  });

  it('describes a rule in one line', () => {
    expect(
      describeRule({
        and: [{ '>': [{ var: 'amount' }, 500] }, { '==': [{ var: 'location' }, 'LHR'] }],
      }),
    ).toBe('amount > 500 and location = LHR');
  });
});

describe('diffing versions', () => {
  const a = toSpec(templateDoc('twoPerson'));
  it('sees nothing when nothing changed', () => {
    expect(diffSpecs(a, a).empty).toBe(true);
  });
  it('lists added, removed and changed steps and the fields that changed', () => {
    const b = toSpec(templateDoc('managerThenFinance'));
    const d = diffSpecs(a, b);
    expect(d.added.length + d.removed.length).toBeGreaterThan(0);
    const c = structuredClone(a);
    const id = Object.keys(c.steps)[0]!;
    (c.steps[id] as { name: string }).name = 'Renamed';
    expect(diffSpecs(a, c).changed).toEqual([{ id, fields: ['name'] }]);
  });
  it('treats no earlier version as everything added', () => {
    expect(diffSpecs(null, a).added).toEqual(Object.keys(a.steps));
  });
});
