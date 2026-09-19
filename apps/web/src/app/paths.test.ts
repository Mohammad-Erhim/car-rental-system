import { describe, expect, it } from 'vitest';

import { fillPattern, LEGACY_REDIRECTS, paths } from './paths';

describe('paths', () => {
  it('encodes ids and references', () => {
    expect(paths.reservation('RES 1/2')).toBe('/reservations/RES%201%2F2');
    expect(paths.translationEditor('lookup:currency', 'fr')).toBe(
      '/website/translations/lookup%3Acurrency/fr',
    );
  });

  it('fills patterns from params', () => {
    expect(fillPattern('/website/templates/:key/:channel', { key: 'a.b', channel: 'email' })).toBe(
      '/website/templates/a.b/email',
    );
  });

  it('redirects every legacy address to a distinct, existing-shaped target', () => {
    const froms = LEGACY_REDIRECTS.map(([f]) => f);
    expect(new Set(froms).size).toBe(froms.length);
    for (const [, to] of LEGACY_REDIRECTS) expect(to.startsWith('/')).toBe(true);
  });

  it('never redirects a path to itself (no loops)', () => {
    for (const [from, to] of LEGACY_REDIRECTS) expect(to).not.toBe(from);
  });
});
