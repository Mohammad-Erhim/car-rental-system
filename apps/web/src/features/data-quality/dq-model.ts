import type { DataQualityCheck } from '@/lib/admin-hooks';

/**
 * Checks whose sample keys are a record reference this app has a page for, so a flagged reference
 * is one click from the record. Other checks' keys (a plate, a `kind:key` pair) stay plain text
 * rather than link to a page that can't filter by them. Paths are router-relative (the app is
 * mounted under /ops).
 */
export const SAMPLE_LINK: Partial<Record<string, (key: string) => string>> = {
  reservation_orphan_account: (key) => `/work/${encodeURIComponent(key)}`,
  rental_active_without_unit: (key) => `/rentals/${encodeURIComponent(key)}`,
};

/** A finding still asking for attention (open) versus one someone has already dealt with. */
export const needsAction = (c: DataQualityCheck) => !c.ok && !c.error && c.findingState === 'open';

export type Tab = 'all' | 'issues' | 'clear';

export function inTab(c: DataQualityCheck, tab: Tab) {
  if (tab === 'all') return true;
  return tab === 'clear' ? c.ok : !c.ok;
}

/** Which actions a finding offers: nothing once resolved, clear, false-positive or when the check itself failed. */
export function findingActions(
  c: DataQualityCheck,
): Array<'acknowledge' | 'resolve' | 'falsePositive'> {
  if (
    c.error ||
    c.findingState === 'clear' ||
    c.findingState === 'resolved' ||
    c.findingState === 'false_positive'
  ) {
    return [];
  }
  return c.findingState === 'open'
    ? ['acknowledge', 'resolve', 'falsePositive']
    : ['resolve', 'falsePositive'];
}
