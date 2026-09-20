import type { WorkflowSpec } from '@carrental/contracts';

export interface SpecDiff {
  added: string[];
  removed: string[];
  changed: Array<{ id: string; fields: string[] }>;
  startChanged: boolean;
  fallbackChanged: boolean;
  revisionsChanged: boolean;
  empty: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What differs between two saved versions, step by step — for the history and before publishing. */
export function diffSpecs(before: WorkflowSpec | null | undefined, after: WorkflowSpec): SpecDiff {
  const b = before?.steps ?? {};
  const a = after.steps;
  const added = Object.keys(a).filter((id) => !(id in b));
  const removed = Object.keys(b).filter((id) => !(id in a));
  const changed: SpecDiff['changed'] = [];
  for (const id of Object.keys(a)) {
    if (!(id in b)) continue;
    const x = b[id] as unknown as Record<string, unknown>;
    const y = a[id] as unknown as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(
      (k) => !same(x[k], y[k]),
    );
    if (fields.length) changed.push({ id, fields });
  }
  const startChanged = (before?.start ?? null) !== after.start;
  const fallbackChanged = !same(before?.fallbackActors ?? [], after.fallbackActors);
  const revisionsChanged = (before?.maxRevisions ?? after.maxRevisions) !== after.maxRevisions;
  return {
    added,
    removed,
    changed,
    startChanged,
    fallbackChanged,
    revisionsChanged,
    empty:
      !added.length &&
      !removed.length &&
      !changed.length &&
      !startChanged &&
      !fallbackChanged &&
      !revisionsChanged,
  };
}
