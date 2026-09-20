import { Injectable } from '@nestjs/common';

import type { WorkflowActionDef } from './workflow.types';

/**
 * Every action a pipeline can be put in front of. Domain modules register their own at boot (they
 * alone know how to apply the change); the builder lists exactly these, and a test fails if one
 * lacks an executor.
 */
@Injectable()
export class WorkflowRegistry {
  private readonly actions = new Map<string, WorkflowActionDef<never>>();

  register<P>(def: WorkflowActionDef<P>): void {
    if (this.actions.has(def.key))
      throw new Error(`Workflow action "${def.key}" is already registered`);
    this.actions.set(def.key, def as unknown as WorkflowActionDef<never>);
  }

  get(key: string): WorkflowActionDef<Record<string, unknown>> | undefined {
    return this.actions.get(key) as unknown as
      | WorkflowActionDef<Record<string, unknown>>
      | undefined;
  }

  require(key: string): WorkflowActionDef<Record<string, unknown>> {
    const def = this.get(key);
    if (!def) throw new Error(`Unknown workflow action "${key}"`);
    return def;
  }

  list(): WorkflowActionDef<Record<string, unknown>>[] {
    return [...this.actions.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    ) as unknown as WorkflowActionDef<Record<string, unknown>>[];
  }
}
