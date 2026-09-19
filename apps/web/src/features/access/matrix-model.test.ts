import { describe, expect, it } from 'vitest';

import {
  cellState,
  groupTally,
  grantedActions,
  pendingCount,
  setGroup,
  toChanges,
  toggleCell,
} from './matrix-model';

import type { PermissionAction, RoleRow } from '@/lib/access-hooks';

const cat: PermissionAction[] = ['a.read', 'a.write', 'b.read'].map((code) => ({
  code,
  group: code.split('.')[0]!,
  riskLevel: 'normal',
  description: code,
}));
const role = (code: string, actions: string[], locked = false): RoleRow => ({
  id: code,
  code,
  name: code,
  description: null,
  isSystem: locked,
  locked,
  archived: false,
  permissionActions: actions,
  conditions: {},
  holderCount: 0,
  version: 1,
});

describe('matrix model', () => {
  it('the wildcard grants the whole catalogue', () => {
    expect([...grantedActions(role('admin', ['*'], true), cat)].sort()).toEqual([
      'a.read',
      'a.write',
      'b.read',
    ]);
  });

  it('toggling a granted cell marks a removal, toggling again cancels it', () => {
    const r = role('r', ['a.read']);
    let p = toggleCell({}, r, 'a.read', cat);
    expect(cellState(r, 'a.read', cat, p)).toBe('removing');
    expect(toChanges(p)).toEqual([{ roleCode: 'r', add: [], remove: ['a.read'] }]);
    p = toggleCell(p, r, 'a.read', cat);
    expect(p).toEqual({}); // back to nothing pending
  });

  it('toggling an ungranted cell marks an addition', () => {
    const r = role('r', []);
    const p = toggleCell({}, r, 'a.write', cat);
    expect(cellState(r, 'a.write', cat, p)).toBe('adding');
    expect(pendingCount(p)).toBe(1);
  });

  it('a locked (system) role cannot be edited', () => {
    const r = role('sys', ['a.read'], true);
    expect(toggleCell({}, r, 'a.read', cat)).toEqual({});
    expect(setGroup({}, r, cat, false, cat)).toEqual({});
  });

  it('setting a whole module on/off only edits the cells that differ', () => {
    const r = role('r', ['a.read']);
    const a = cat.filter((x) => x.group === 'a');
    const on = setGroup({}, r, a, true, cat);
    expect(on).toEqual({ r: { add: ['a.write'], remove: [] } });
    const off = setGroup({}, r, a, false, cat);
    expect(off).toEqual({ r: { add: [], remove: ['a.read'] } });
    expect(groupTally(r, a, cat, on)).toEqual({ on: 2, total: 2 });
  });

  it('edits to several roles stay separate', () => {
    const p = toggleCell(
      toggleCell({}, role('x', []), 'a.read', cat),
      role('y', ['b.read']),
      'b.read',
      cat,
    );
    expect(Object.keys(p).sort()).toEqual(['x', 'y']);
    expect(pendingCount(p)).toBe(2);
  });
});
