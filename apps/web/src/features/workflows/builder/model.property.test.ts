import { validateWorkflowGraph, type WorkflowSpec, type WorkflowStep } from '@carrental/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  fromSpec,
  insertStep,
  moveStep,
  newStep,
  removeStep,
  toSpec,
  type EditorDoc,
  type StepType,
} from './model';

const TYPES: StepType[] = ['approval', 'task', 'wait', 'auto', 'condition', 'parallel'];
const empty: EditorDoc = {
  steps: [],
  fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  maxRevisions: 3,
};

/** Build an editor document from a list of step kinds (each step keeps the default "next in the list"). */
const docFrom = (kinds: number[]): EditorDoc => {
  let doc = empty;
  for (const k of kinds) doc = insertStep(doc, newStep(doc, TYPES[k % TYPES.length]!, 'Step'));
  return doc;
};

const kindsArb = fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 0, maxLength: 8 });

describe('the editor model — properties', () => {
  it('any pipeline built in the editor is a valid saved graph', () => {
    fc.assert(
      fc.property(kindsArb, (kinds) => {
        expect(validateWorkflowGraph(toSpec(docFrom(kinds)))).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('saving and loading again changes nothing (round trip)', () => {
    fc.assert(
      fc.property(kindsArb, (kinds) => {
        const spec = toSpec(docFrom(kinds));
        const { doc, dropped } = fromSpec(spec);
        expect(dropped).toEqual([]);
        expect(toSpec(doc)).toEqual(spec);
      }),
      { numRuns: 200 },
    );
  });

  it('no sequence of moves and deletes ever leaves a dangling pointer or a loop', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('move' as const), from: fc.nat(9), to: fc.nat(9) }),
      fc.record({ kind: fc.constant('remove' as const), at: fc.nat(9) }),
      fc.record({
        kind: fc.constant('add' as const),
        type: fc.integer({ min: 0, max: 5 }),
        at: fc.nat(9),
      }),
    );
    fc.assert(
      fc.property(kindsArb, fc.array(op, { maxLength: 12 }), (kinds, ops) => {
        let doc = docFrom(kinds);
        for (const o of ops) {
          if (o.kind === 'move')
            doc = moveStep(
              doc,
              o.from % Math.max(1, doc.steps.length),
              o.to % Math.max(1, doc.steps.length),
            );
          else if (o.kind === 'remove' && doc.steps.length)
            doc = removeStep(doc, doc.steps[o.at % doc.steps.length]!.id);
          else if (o.kind === 'add')
            doc = insertStep(
              doc,
              newStep(doc, TYPES[o.type]!, 'Added'),
              o.at % (doc.steps.length + 1),
            );
        }
        const spec = toSpec(doc);
        expect(validateWorkflowGraph(spec)).toEqual([]);
        // every main step is reachable and ids stay unique
        const ids = Object.keys(spec.steps);
        expect(new Set(ids).size).toBe(ids.length);
        const again = fromSpec(spec);
        expect(again.dropped).toEqual([]);
        expect(toSpec(again.doc)).toEqual(spec);
      }),
      { numRuns: 300 },
    );
  });

  it('a step kept in the list never points somewhere that was removed', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 2, maxLength: 8 }),
        fc.nat(),
        (kinds, at) => {
          const doc = docFrom(kinds);
          const gone = doc.steps[at % doc.steps.length]!.id;
          const spec: WorkflowSpec = toSpec(removeStep(doc, gone));
          for (const s of Object.values(spec.steps) as WorkflowStep[]) {
            const targets =
              s.type === 'condition' ? [...s.branches.map((b) => b.next), s.else] : [s.next];
            expect(targets).not.toContain(gone);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
