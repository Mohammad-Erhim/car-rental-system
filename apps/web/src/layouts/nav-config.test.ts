import { describe, expect, it } from 'vitest';

import {
  findEntry,
  firstPath,
  flattenNav,
  NAV_GROUPS,
  navKey,
  visibleNavGroups,
  type NavGroup,
} from './nav-config';

import { LEGACY_REDIRECTS } from '@/app/paths';

const allowing =
  (...held: string[]) =>
  (...wanted: string[]) =>
    wanted.some((w) => held.includes(w));

const pagePaths = (groups: NavGroup[]) =>
  flattenNav(groups)
    .map((e) => e.item.to)
    .filter(Boolean);

describe('visibleNavGroups', () => {
  it('always keeps the un-gated dashboard entry', () => {
    const groups = visibleNavGroups(allowing());
    expect(groups).toHaveLength(1);
    expect(pagePaths(groups)).toEqual(['/']);
  });

  it('shows only the entries the actor may open, dropping emptied groups', () => {
    const groups = visibleNavGroups(allowing('fleet.read', 'staff.manage'));
    // the media library also opens for `fleet.read`
    expect(pagePaths(groups)).toEqual(['/', '/fleet', '/website/media', '/admin/staff']);
    expect(groups.map((g) => g.titleKey)).toEqual([
      undefined,
      'ops.navGroup.operations',
      'ops.navGroup.website',
      'ops.navGroup.administration',
    ]);
  });

  it('shows a folder only while something inside it is visible', () => {
    const none = visibleNavGroups(allowing('config.read'));
    expect(flattenNav(none).some((e) => e.item.id === 'integrations')).toBe(false);
    const some = visibleNavGroups(allowing('email.manage'));
    const folder = flattenNav(some).find((e) => e.item.id === 'integrations');
    expect(folder?.item.children?.map((c) => c.to)).toEqual(['/settings/integrations/email']);
  });

  it('keeps nested pages under their parent, filtered on their own permission', () => {
    const groups = visibleNavGroups(allowing('catalogue.read'));
    const cat = flattenNav(groups).find((e) => e.item.to === '/catalogue/categories');
    expect(cat?.item.children?.map((c) => c.to)).toEqual(['/catalogue/categories/features']);
  });

  it('shows everything to an actor with every permission', () => {
    const count = (g: NavGroup[]) => flattenNav(g).length;
    expect(count(visibleNavGroups(() => true))).toBe(count(NAV_GROUPS));
  });

  it('has unique destinations and keys', () => {
    const paths = pagePaths(NAV_GROUPS);
    expect(new Set(paths).size).toBe(paths.length);
    const keys = flattenNav(NAV_GROUPS).map((e) => navKey(e.item));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never points an entry at an address that only redirects', () => {
    const old = new Set(LEGACY_REDIRECTS.map(([from]) => from));
    for (const p of pagePaths(NAV_GROUPS)) expect(old.has(p!)).toBe(false);
  });
});

describe('findEntry', () => {
  it('prefers the most specific entry', () => {
    expect(findEntry(NAV_GROUPS, '/catalogue/categories/features')?.item.to).toBe(
      '/catalogue/categories/features',
    );
    expect(findEntry(NAV_GROUPS, '/catalogue/categories')?.item.to).toBe('/catalogue/categories');
  });

  it('maps a detail route to its list, with the group and ancestors', () => {
    const e = findEntry(NAV_GROUPS, '/website/translations/ui/fr');
    expect(e?.item.to).toBe('/website/translations');
    expect(e?.ancestors.map((a) => a.to)).toEqual(['/website/languages']);
    expect(e?.group.titleKey).toBe('ops.navGroup.website');
  });

  it('returns null for an unknown path', () => {
    expect(findEntry(NAV_GROUPS, '/nope')).toBeNull();
  });
});

describe('firstPath', () => {
  it('leads a folder to its first page', () => {
    const folder = flattenNav(NAV_GROUPS).find((e) => e.item.id === 'integrations')!.item;
    expect(firstPath(folder)).toBe('/settings/integrations/payments');
  });
});

describe('visibleNavGroups — location-limited accounts', () => {
  const everything = () => true;
  const org = [
    '/finance',
    '/website/branding',
    '/website/translations',
    '/settings/organization',
    '/admin/audit',
    '/admin/data-quality',
    '/catalogue/categories',
  ];

  it('hides every organisation-wide area from an account limited to specific locations', () => {
    const paths = pagePaths(visibleNavGroups(everything, undefined, true));
    for (const p of org) expect(paths).not.toContain(p);
  });

  it('keeps the branch-aware and shared pages', () => {
    const paths = pagePaths(visibleNavGroups(everything, undefined, true));
    for (const p of [
      '/',
      '/search',
      '/reservations',
      '/rentals',
      '/fleet',
      '/reports',
      '/catalogue/rate-plans',
      '/catalogue/products',
      '/catalogue/locations',
      '/admin/staff',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('an organisation-wide account still sees them all', () => {
    const paths = pagePaths(visibleNavGroups(everything, undefined, false));
    for (const p of org) expect(paths).toContain(p);
  });
});
