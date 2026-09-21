import type { TranslationEntry } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import {
  bucketOf,
  editorPath,
  inBucket,
  matchesQuery,
  namespaceTitleKey,
  pivotCoverage,
} from './translation-model';

const entry = (over: Partial<TranslationEntry>): TranslationEntry => ({
  key: 'nav.home',
  source: 'Home',
  translation: null,
  published: null,
  status: 'missing',
  outdated: false,
  version: 0,
  reviewedAt: null,
  ...over,
});

describe('translation-model', () => {
  it('pivots coverage per namespace, worst first', () => {
    const cell = (namespace: string, locale: string, missing: number) => ({
      namespace,
      locale,
      total: 10,
      published: 10 - missing,
      missing,
      coveragePct: (10 - missing) * 10,
    });
    const rows = pivotCoverage(
      [cell('a', 'fr', 0), cell('b', 'fr', 3), cell('b', 'ar', 2), cell('a', 'ar', 0)],
      ['fr', 'ar'],
    );
    expect(rows.map((r) => [r.namespace, r.gaps])).toEqual([
      ['b', 5],
      ['a', 0],
    ]);
  });

  it('puts untranslated and draft strings on the to-do tab', () => {
    expect(bucketOf(entry({ status: 'missing' }))).toBe('todo');
    expect(bucketOf(entry({ status: 'draft' }))).toBe('todo');
    expect(bucketOf(entry({ status: 'in_review' }))).toBe('review');
    expect(inBucket(entry({ status: 'published' }), 'all')).toBe(true);
    expect(inBucket(entry({ status: 'published' }), 'todo')).toBe(false);
  });

  it('searches key, source and translation', () => {
    const e = entry({ key: 'nav.home', source: 'Home', translation: 'Accueil' });
    expect(matchesQuery(e, 'acc')).toBe(true);
    expect(matchesQuery(e, 'NAV')).toBe(true);
    expect(matchesQuery(e, 'zzz')).toBe(false);
    expect(matchesQuery(e, '  ')).toBe(true);
  });

  it('encodes a namespace with a colon into the path', () => {
    expect(editorPath('lookup:currency', 'fr')).toBe('/website/translations/lookup%3Acurrency/fr');
  });

  it('names the database-backed areas in plain words', () => {
    expect(namespaceTitleKey('catalogue:location')).toBe('ops.trans.area.location');
    expect(namespaceTitleKey('catalogue:product')).toBe('ops.trans.area.product');
    expect(namespaceTitleKey('lookup:currency')).toBe('ops.trans.area.lookup');
    expect(namespaceTitleKey('common')).toBeNull();
  });
});
