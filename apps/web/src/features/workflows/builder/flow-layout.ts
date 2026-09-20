import type { WorkflowSpec, WorkflowStep } from '@carrental/contracts';

export interface FlowNode {
  id: string;
  label: string;
  type: WorkflowStep['type'] | 'start' | 'end';
  column: number;
  row: number;
  /** a step that runs inside a parallel step's route */
  inline?: boolean;
}
export interface FlowEdge {
  from: string;
  to: string;
  /** e.g. the branch label of a condition */
  label?: string;
  /** the "otherwise" route of a condition (the view words it) */
  otherwise?: boolean;
}
export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
  columns: number;
  rows: number;
}

const START = '__start__';
const END = '__end__';

/**
 * A layered picture of a saved workflow: each step sits in the column of the longest route that
 * reaches it (so a branch that re-joins lines up), steps that share a column are stacked, and every
 * route that ends points at one shared "end". Parallel routes are laid out as their own lanes between
 * the parallel step and where they join. Pure, so the layout is testable without drawing anything.
 */
export function layoutFlow(
  spec: WorkflowSpec,
  labelOf: (step: WorkflowStep) => string = (s) => s.name,
): Flow {
  const steps = spec.steps;
  const inline = new Set<string>();
  for (const s of Object.values(steps))
    if (s.type === 'parallel') for (const b of s.branches) for (const id of b) inline.add(id);

  const edges: FlowEdge[] = [];
  const succ = new Map<string, string[]>(); // for depth computation
  const link = (from: string, to: string | null, label?: string, otherwise = false) => {
    const target = to ?? END;
    edges.push({
      from,
      to: target,
      ...(label ? { label } : {}),
      ...(otherwise ? { otherwise: true } : {}),
    });
    succ.set(from, [...(succ.get(from) ?? []), target]);
  };

  if (spec.start === null) {
    return {
      nodes: [
        { id: START, label: '', type: 'start', column: 0, row: 0 },
        { id: END, label: '', type: 'end', column: 1, row: 0 },
      ],
      edges: [{ from: START, to: END }],
      columns: 2,
      rows: 1,
    };
  }
  link(START, spec.start);
  for (const step of Object.values(steps)) {
    if (inline.has(step.id)) continue;
    if (step.type === 'condition') {
      step.branches.forEach((b, i) => link(step.id, b.next, b.label || `#${i + 1}`));
      link(step.id, step.else, undefined, true);
    } else if (step.type === 'parallel') {
      for (const branch of step.branches) {
        link(step.id, branch[0]!);
        for (let i = 0; i < branch.length - 1; i++) link(branch[i]!, branch[i + 1]!);
        link(branch[branch.length - 1]!, step.next);
      }
    } else {
      link(step.id, step.next);
    }
  }

  // column = longest path from the start (memoised DFS; the graph is acyclic once it validates —
  // a cycle is cut rather than followed, so drawing a broken definition never hangs)
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const columnOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const [from, tos] of succ) if (tos.includes(id)) d = Math.max(d, columnOf(from) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  const ids = [START, ...Object.keys(steps), END];
  for (const id of ids) columnOf(id);

  const rowsUsed = new Map<number, number>();
  const nodes: FlowNode[] = ids
    .filter((id) => id === START || id === END || succ.has(id) || edges.some((e) => e.to === id))
    .map((id) => {
      const column = depth.get(id) ?? 0;
      const row = rowsUsed.get(column) ?? 0;
      rowsUsed.set(column, row + 1);
      const step = steps[id];
      return {
        id,
        label: step ? labelOf(step) : '',
        type: step ? step.type : id === START ? 'start' : 'end',
        column,
        row,
        ...(inline.has(id) ? { inline: true } : {}),
      } as FlowNode;
    });
  const columns = Math.max(...nodes.map((n) => n.column)) + 1;
  const rows = Math.max(...[...rowsUsed.values()]);
  return { nodes, edges, columns, rows };
}
