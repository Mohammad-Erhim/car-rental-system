/**
 * Pure permission evaluation — no database, no framework — so the rules are unit-testable and the
 * same code answers "what can this person do" for one request, for the whole staff matrix, and for
 * "who can do X".
 *
 * Model: a person's effective permissions = the union of every ACTIVE role assignment (not
 * expired, role not archived) − their `deny` overrides + their `allow` overrides. **Deny beats
 * allow** — from any source. A role may grant the wildcard `*` (every action in the catalogue,
 * resolved now, so an action added tomorrow is covered without a reseed). Grants may carry
 * conditions (`amountMinorMax`); when several roles grant the same action, the most permissive
 * wins (no condition on any granting role = unlimited).
 */

export const WILDCARD = '*';

export interface ActionCondition {
  /** the largest amount (minor units) this grant may act on, e.g. a refund */
  amountMinorMax?: number;
}
export type ConditionMap = Record<string, ActionCondition>;

export interface GraphRole {
  id: string;
  code: string;
  name: string;
  actions: string[];
  conditions: ConditionMap;
  archived: boolean;
}

export interface GraphAssignment {
  id: string;
  staffProfileId: string;
  roleId: string;
  validFrom: string;
  validUntil: string | null;
  reason?: string | null;
}

export interface GraphOverride {
  id: string;
  staffProfileId: string;
  action: string;
  effect: 'allow' | 'deny';
  validUntil: string | null;
  reason?: string | null;
}

export interface AccessGraph {
  /** every action code in the catalogue (what `*` expands to) */
  catalogue: string[];
  roles: GraphRole[];
  assignments: GraphAssignment[];
  overrides: GraphOverride[];
}

export type AccessSource =
  | { kind: 'role'; code: string; name: string; validUntil: string | null }
  | {
      kind: 'override';
      effect: 'allow' | 'deny';
      validUntil: string | null;
      reason: string | null;
    };

export interface EffectiveAccess {
  /** codes of the roles currently in force */
  roleCodes: string[];
  /** sorted, deduplicated */
  permissions: string[];
  /** actions removed by a deny override (even if a role grants them) */
  denied: string[];
  conditions: ConditionMap;
  /** why each permission (or denial) applies */
  sources: Record<string, AccessSource[]>;
}

const activeAt = (validFrom: string, validUntil: string | null, at: number) =>
  new Date(validFrom).getTime() <= at &&
  (validUntil === null || new Date(validUntil).getTime() > at);

export function expandActions(actions: string[], catalogue: string[]): string[] {
  return actions.includes(WILDCARD) ? [...catalogue] : actions;
}

/** The person's effective access at `at` (default: now). */
export function computeEffective(
  graph: AccessGraph,
  staffProfileId: string,
  at: Date = new Date(),
): EffectiveAccess {
  const t = at.getTime();
  const roleById = new Map(graph.roles.map((r) => [r.id, r]));
  const granted = new Map<string, AccessSource[]>();
  // per action: unlimited if any granting role has no condition, else the largest limit
  const limit = new Map<string, { unlimited: boolean; max: number }>();
  const roleCodes: string[] = [];

  for (const a of graph.assignments) {
    if (a.staffProfileId !== staffProfileId || !activeAt(a.validFrom, a.validUntil, t)) continue;
    const r = roleById.get(a.roleId);
    if (!r || r.archived) continue;
    if (!roleCodes.includes(r.code)) roleCodes.push(r.code);
    for (const action of expandActions(r.actions, graph.catalogue)) {
      const list = granted.get(action) ?? [];
      list.push({ kind: 'role', code: r.code, name: r.name, validUntil: a.validUntil });
      granted.set(action, list);
      const cap = r.conditions[action]?.amountMinorMax;
      const cur = limit.get(action) ?? { unlimited: false, max: 0 };
      if (cap === undefined) cur.unlimited = true;
      else cur.max = Math.max(cur.max, cap);
      limit.set(action, cur);
    }
  }

  const denied = new Set<string>();
  const sources: Record<string, AccessSource[]> = {};
  for (const o of graph.overrides) {
    if (
      o.staffProfileId !== staffProfileId ||
      (o.validUntil && new Date(o.validUntil).getTime() <= t)
    ) {
      continue;
    }
    const src: AccessSource = {
      kind: 'override',
      effect: o.effect,
      validUntil: o.validUntil,
      reason: o.reason ?? null,
    };
    if (o.effect === 'deny') {
      denied.add(o.action);
      (sources[o.action] ??= []).push(src);
    } else {
      const list = granted.get(o.action) ?? [];
      list.push(src);
      granted.set(o.action, list);
      limit.set(o.action, { unlimited: true, max: 0 }); // an explicit allow carries no limit
    }
  }

  const permissions: string[] = [];
  const conditions: ConditionMap = {};
  for (const [action, list] of granted) {
    if (denied.has(action)) {
      (sources[action] ??= []).unshift(...list);
      continue;
    }
    permissions.push(action);
    sources[action] = list;
    const l = limit.get(action);
    if (l && !l.unlimited) conditions[action] = { amountMinorMax: l.max };
  }
  permissions.sort();
  return { roleCodes, permissions, denied: [...denied].sort(), conditions, sources };
}

/** Everyone in `staffProfileIds` whose effective access includes `action`. */
export function whoCan(
  graph: AccessGraph,
  staffProfileIds: string[],
  action: string,
  at: Date = new Date(),
): Array<{ staffProfileId: string; sources: AccessSource[] }> {
  const out: Array<{ staffProfileId: string; sources: AccessSource[] }> = [];
  for (const id of staffProfileIds) {
    const eff = computeEffective(graph, id, at);
    if (eff.permissions.includes(action))
      out.push({ staffProfileId: id, sources: eff.sources[action] ?? [] });
  }
  return out;
}

/** The refund (or other amount-limited) cap for an action: `null` = unlimited. */
export const amountLimit = (conditions: ConditionMap, action: string): number | null =>
  conditions[action]?.amountMinorMax ?? null;
