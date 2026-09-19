import { describe, expect, it } from 'vitest';

import { isLocationScopedPath, isOrgWidePath } from './paths';

describe('isLocationScopedPath', () => {
  it('is true for the pages the top-bar location filter narrows', () => {
    for (const p of [
      '/',
      '/search',
      '/reservations',
      '/rentals',
      '/fleet',
      '/reports',
      '/catalogue/rate-plans',
    ]) {
      expect(isLocationScopedPath(p)).toBe(true);
    }
  });
  it('ignores a trailing slash and is false for records and everything else', () => {
    expect(isLocationScopedPath('/reservations/')).toBe(true);
    expect(isLocationScopedPath('/reservations/RES-1')).toBe(false);
    expect(isLocationScopedPath('/admin/staff')).toBe(false);
    expect(isLocationScopedPath('/finance')).toBe(false);
  });
});

describe('isOrgWidePath', () => {
  it('matches settings, website, finance and audit areas — and their sub-pages', () => {
    for (const p of [
      '/finance',
      '/settings/organization',
      '/settings/integrations/payments',
      '/website/branding',
      '/website/translations/common/en',
      '/admin/audit',
      '/admin/data-quality',
      '/catalogue/categories/features',
    ]) {
      expect(isOrgWidePath(p)).toBe(true);
    }
  });
  it('does not match the branch-aware pages, staff, locations or records', () => {
    for (const p of [
      '/',
      '/reservations',
      '/rentals/R1',
      '/fleet',
      '/customers',
      '/admin/staff',
      '/catalogue/locations',
      '/catalogue/rate-plans',
      '/catalogue/products',
      '/website/media',
    ]) {
      expect(isOrgWidePath(p)).toBe(false);
    }
  });
});
