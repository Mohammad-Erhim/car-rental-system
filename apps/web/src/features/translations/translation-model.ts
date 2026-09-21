import type { TranslationEntry } from '@carrental/contracts';

import { paths } from '@/app/paths';

export interface CoverageRow {
  namespace: string;
  locale: string;
  total: number;
  published: number;
  missing: number;
  coveragePct: number;
}

export interface PivotRow {
  namespace: string;
  cells: Map<string, CoverageRow>;
  /** strings still missing across the shown languages */
  gaps: number;
}

/**
 * One row per namespace with a cell per language, worst first, so the summary stays readable as
 * the catalogue grows (UI strings plus every reference-data type).
 */
export function pivotCoverage(rows: CoverageRow[], locales: string[]): PivotRow[] {
  const byNs = new Map<string, Map<string, CoverageRow>>();
  for (const r of rows) {
    if (!byNs.has(r.namespace)) byNs.set(r.namespace, new Map());
    byNs.get(r.namespace)!.set(r.locale, r);
  }
  return [...byNs.entries()]
    .map(([namespace, cells]) => ({
      namespace,
      cells,
      gaps: locales.reduce((sum, l) => sum + (cells.get(l)?.missing ?? 0), 0),
    }))
    .sort((a, b) => b.gaps - a.gaps || a.namespace.localeCompare(b.namespace));
}

export type Bucket = 'all' | 'todo' | 'review' | 'published';

/** Which working tab a string belongs to: untranslated or draft = to do. */
export const bucketOf = (e: TranslationEntry): Exclude<Bucket, 'all'> =>
  e.status === 'in_review' ? 'review' : e.status === 'published' ? 'published' : 'todo';

export const inBucket = (e: TranslationEntry, b: Bucket) => b === 'all' || bucketOf(e) === b;

export function matchesQuery(e: TranslationEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    e.key.toLowerCase().includes(q) ||
    e.source.toLowerCase().includes(q) ||
    (e.translation ?? '').toLowerCase().includes(q)
  );
}

/** the namespace travels in the URL; it can contain a colon (`lookup:currency`) */
export const editorPath = (namespace: string, locale: string) =>
  paths.translationEditor(namespace, locale);

/**
 * A plain-words title for the areas whose text lives in the database rather than in the app, so the
 * screen says "Branches" beside `catalogue:location` instead of leaving the code to be decoded.
 * `null` for an area with no title of its own (the app's own screens, which the code already names).
 */
export function namespaceTitleKey(namespace: string): string | null {
  switch (namespace) {
    case 'catalogue:location':
      return 'ops.trans.area.location';
    case 'catalogue:product':
      return 'ops.trans.area.product';
    case 'catalogue:category':
      return 'ops.trans.area.category';
    case 'catalogue:feature':
      return 'ops.trans.area.feature';
    default:
      return namespace.startsWith('lookup:') ? 'ops.trans.area.lookup' : null;
  }
}
