import type { MatrixChange, PermissionAction, RoleRow } from '@/lib/access-hooks';

/** Unsaved edits to the roles × permissions grid: per role, what is being added and removed. */
export type Pending = Record<string, { add: string[]; remove: string[] }>;

export const WILDCARD = '*';

/** The actions a role effectively grants (the wildcard expands to the whole catalogue). */
export function grantedActions(role: RoleRow, catalogue: PermissionAction[]): Set<string> {
  return new Set(
    role.permissionActions.includes(WILDCARD)
      ? catalogue.map((a) => a.code)
      : role.permissionActions,
  );
}

export type CellState = 'granted' | 'not' | 'adding' | 'removing';

export function cellState(
  role: RoleRow,
  action: string,
  catalogue: PermissionAction[],
  pending: Pending,
): CellState {
  const p = pending[role.code];
  if (p?.add.includes(action)) return 'adding';
  if (p?.remove.includes(action)) return 'removing';
  return grantedActions(role, catalogue).has(action) ? 'granted' : 'not';
}

/** Flip one cell. Toggling a pending edit back cancels it; a locked role can't be edited. */
export function toggleCell(
  pending: Pending,
  role: RoleRow,
  action: string,
  catalogue: PermissionAction[],
): Pending {
  if (role.locked) return pending;
  const granted = grantedActions(role, catalogue).has(action);
  const cur = pending[role.code] ?? { add: [], remove: [] };
  let add = cur.add;
  let remove = cur.remove;
  if (granted) {
    remove = remove.includes(action) ? remove.filter((a) => a !== action) : [...remove, action];
  } else {
    add = add.includes(action) ? add.filter((a) => a !== action) : [...add, action];
  }
  const next = { ...pending };
  if (add.length || remove.length) next[role.code] = { add, remove };
  else delete next[role.code];
  return next;
}

/** Set every action of a module (a row group) on or off for one role. */
export function setGroup(
  pending: Pending,
  role: RoleRow,
  actions: PermissionAction[],
  on: boolean,
  catalogue: PermissionAction[],
): Pending {
  if (role.locked) return pending;
  let next = pending;
  for (const a of actions) {
    const state = cellState(role, a.code, catalogue, next);
    const isOn = state === 'granted' || state === 'adding';
    if (isOn !== on) next = toggleCell(next, role, a.code, catalogue);
  }
  return next;
}

export const toChanges = (pending: Pending): MatrixChange[] =>
  Object.entries(pending).map(([roleCode, p]) => ({ roleCode, add: p.add, remove: p.remove }));

export const pendingCount = (pending: Pending): number =>
  Object.values(pending).reduce((n, p) => n + p.add.length + p.remove.length, 0);

/** "3 of 7 granted" for a module column header, counting pending edits. */
export function groupTally(
  role: RoleRow,
  actions: PermissionAction[],
  catalogue: PermissionAction[],
  pending: Pending,
) {
  let on = 0;
  for (const a of actions) {
    const s = cellState(role, a.code, catalogue, pending);
    if (s === 'granted' || s === 'adding') on++;
  }
  return { on, total: actions.length };
}
