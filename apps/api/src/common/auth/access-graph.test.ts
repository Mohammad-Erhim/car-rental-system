import { describe, expect, it } from 'vitest';

import {
  computeEffective,
  whoCan,
  type AccessGraph,
  type GraphAssignment,
  type GraphOverride,
  type GraphRole,
} from './access-graph';

const CATALOGUE = ['a.read', 'a.write', 'payment.refund', 'staff.manage', 'z.new'];
const role = (
  id: string,
  code: string,
  actions: string[],
  extra: Partial<GraphRole> = {},
): GraphRole => ({
  id,
  code,
  name: code.toUpperCase(),
  actions,
  conditions: {},
  archived: false,
  ...extra,
});
const NOW = new Date('2026-06-15T12:00:00Z');
const past = '2026-01-01T00:00:00Z';
const future = '2027-01-01T00:00:00Z';
const assign = (
  id: string,
  staff: string,
  roleId: string,
  over: Partial<GraphAssignment> = {},
): GraphAssignment => ({
  id,
  staffProfileId: staff,
  roleId,
  validFrom: past,
  validUntil: null,
  ...over,
});
const override = (
  id: string,
  staff: string,
  action: string,
  effect: 'allow' | 'deny',
  over: Partial<GraphOverride> = {},
): GraphOverride => ({
  id,
  staffProfileId: staff,
  action,
  effect,
  validUntil: null,
  ...over,
});
const graph = (g: Partial<AccessGraph>): AccessGraph => ({
  catalogue: CATALOGUE,
  roles: [],
  assignments: [],
  overrides: [],
  ...g,
});

describe('computeEffective', () => {
  it('is the union of every active role', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read']), role('r2', 'writer', ['a.write'])],
      assignments: [assign('1', 's', 'r1'), assign('2', 's', 'r2')],
    });
    const e = computeEffective(g, 's', NOW);
    expect(e.permissions).toEqual(['a.read', 'a.write']);
    expect(e.roleCodes).toEqual(['reader', 'writer']);
  });

  it('nobody else’s roles leak in', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read'])],
      assignments: [assign('1', 'other', 'r1')],
    });
    expect(computeEffective(g, 's', NOW).permissions).toEqual([]);
  });

  it('ignores expired, not-yet-started and archived-role assignments', () => {
    const g = graph({
      roles: [
        role('r1', 'x', ['a.read']),
        role('r2', 'y', ['a.write'], { archived: true }),
        role('r3', 'z', ['z.new']),
      ],
      assignments: [
        assign('1', 's', 'r1', { validUntil: '2026-06-01T00:00:00Z' }), // expired
        assign('2', 's', 'r2'), // archived role
        assign('3', 's', 'r3', { validFrom: future }), // not yet
      ],
    });
    expect(computeEffective(g, 's', NOW).permissions).toEqual([]);
  });

  it('an assignment starts and ends exactly on its boundaries', () => {
    const g = graph({
      roles: [role('r1', 'x', ['a.read'])],
      assignments: [
        assign('1', 's', 'r1', {
          validFrom: '2026-06-15T12:00:00Z',
          validUntil: '2026-06-15T13:00:00Z',
        }),
      ],
    });
    expect(computeEffective(g, 's', NOW).permissions).toEqual(['a.read']); // start inclusive
    expect(computeEffective(g, 's', new Date('2026-06-15T13:00:00Z')).permissions).toEqual([]); // end exclusive
  });

  it('the wildcard grants the whole catalogue, including an action added later', () => {
    const g = graph({ roles: [role('r1', 'admin', ['*'])], assignments: [assign('1', 's', 'r1')] });
    expect(computeEffective(g, 's', NOW).permissions).toEqual([...CATALOGUE].sort());
    const later = { ...g, catalogue: [...CATALOGUE, 'brand.new'] };
    expect(computeEffective(later, 's', NOW).permissions).toContain('brand.new');
  });

  it('DENY beats allow — from any role, the wildcard, or an allow override', () => {
    const g = graph({
      roles: [role('r1', 'admin', ['*'])],
      assignments: [assign('1', 's', 'r1')],
      overrides: [
        override('o1', 's', 'staff.manage', 'deny'),
        override('o2', 's', 'staff.manage', 'allow'),
      ],
    });
    const e = computeEffective(g, 's', NOW);
    expect(e.permissions).not.toContain('staff.manage');
    expect(e.denied).toEqual(['staff.manage']);
  });

  it('an allow override adds an action no role grants', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read'])],
      assignments: [assign('1', 's', 'r1')],
      overrides: [override('o', 's', 'a.write', 'allow')],
    });
    const e = computeEffective(g, 's', NOW);
    expect(e.permissions).toEqual(['a.read', 'a.write']);
    expect(e.sources['a.write']).toEqual([
      expect.objectContaining({ kind: 'override', effect: 'allow' }),
    ]);
  });

  it('an expired override has no effect', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read'])],
      assignments: [assign('1', 's', 'r1')],
      overrides: [override('o', 's', 'a.read', 'deny', { validUntil: '2026-06-01T00:00:00Z' })],
    });
    expect(computeEffective(g, 's', NOW).permissions).toEqual(['a.read']);
  });

  it('sources say why: role names, and the denial', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read']), role('r2', 'also', ['a.read'])],
      assignments: [assign('1', 's', 'r1'), assign('2', 's', 'r2')],
    });
    expect(
      computeEffective(g, 's', NOW).sources['a.read']!.map((s) =>
        s.kind === 'role' ? s.code : '',
      ),
    ).toEqual(['reader', 'also']);
  });
});

describe('conditions (amount limits)', () => {
  const limited = (max: number) =>
    role('r' + max, 'lim' + max, ['payment.refund'], {
      conditions: { 'payment.refund': { amountMinorMax: max } },
    });

  it('a limited grant carries its limit', () => {
    const g = graph({ roles: [limited(20_000)], assignments: [assign('1', 's', 'r20000')] });
    expect(computeEffective(g, 's', NOW).conditions['payment.refund']).toEqual({
      amountMinorMax: 20_000,
    });
  });

  it('several limited roles: the most permissive limit wins', () => {
    const g = graph({
      roles: [limited(20_000), limited(50_000)],
      assignments: [assign('1', 's', 'r20000'), assign('2', 's', 'r50000')],
    });
    expect(computeEffective(g, 's', NOW).conditions['payment.refund']).toEqual({
      amountMinorMax: 50_000,
    });
  });

  it('one unlimited grant of the same action removes the limit', () => {
    const g = graph({
      roles: [limited(20_000), role('u', 'unl', ['payment.refund'])],
      assignments: [assign('1', 's', 'r20000'), assign('2', 's', 'u')],
    });
    expect(computeEffective(g, 's', NOW).conditions['payment.refund']).toBeUndefined();
  });

  it('an allow override is unlimited', () => {
    const g = graph({
      roles: [limited(1)],
      assignments: [assign('1', 's', 'r1')],
      overrides: [override('o', 's', 'payment.refund', 'allow')],
    });
    expect(computeEffective(g, 's', NOW).conditions['payment.refund']).toBeUndefined();
  });

  it('a zero limit is a real limit (cannot refund anything), not "unlimited"', () => {
    const g = graph({ roles: [limited(0)], assignments: [assign('1', 's', 'r0')] });
    expect(computeEffective(g, 's', NOW).conditions['payment.refund']).toEqual({
      amountMinorMax: 0,
    });
  });
});

describe('whoCan', () => {
  it('lists exactly the people who hold the action now, with sources', () => {
    const g = graph({
      roles: [role('r1', 'reader', ['a.read']), role('r2', 'writer', ['a.write'])],
      assignments: [
        assign('1', 'a', 'r1'),
        assign('2', 'b', 'r2'),
        assign('3', 'c', 'r1', { validUntil: '2026-01-02T00:00:00Z' }),
      ],
    });
    const hits = whoCan(g, ['a', 'b', 'c'], 'a.read', NOW);
    expect(hits.map((h) => h.staffProfileId)).toEqual(['a']);
  });
});
