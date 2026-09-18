import { describe, expect, it } from 'vitest';

import { NAV_GROUPS, visibleNavGroups } from './nav-config';

const allowing =
  (...held: string[]) =>
  (...wanted: string[]) =>
    wanted.some((w) => held.includes(w));

describe('visibleNavGroups', () => {
  it('always keeps the un-gated dashboard entry', () => {
    const groups = visibleNavGroups(allowing());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.to)).toEqual(['/']);
  });

  it('shows only the entries the actor may open, dropping emptied groups', () => {
    const groups = visibleNavGroups(allowing('fleet.read', 'staff.manage'));
    const paths = groups.flatMap((g) => g.items.map((i) => i.to));
    // the media library also opens for `fleet.read`
    expect(paths).toEqual(['/', '/fleet', '/catalogue/media', '/admin/staff']);
    expect(groups.map((g) => g.titleKey)).toEqual([
      undefined,
      'ops.navGroup.operations',
      'ops.navGroup.catalogue',
      'ops.navGroup.administration',
    ]);
  });

  it('shows everything to an actor with every permission', () => {
    const total = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    const shown = visibleNavGroups(() => true).reduce((n, g) => n + g.items.length, 0);
    expect(shown).toBe(total);
  });

  it('has unique destinations', () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(new Set(paths).size).toBe(paths.length);
  });
});
