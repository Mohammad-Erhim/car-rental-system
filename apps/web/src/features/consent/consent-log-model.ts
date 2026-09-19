import type { ConsentLogEntry } from '@carrental/contracts';

import { csvCell } from '@/lib/csv';

export const LOG_ACTIONS = ['accept_all', 'reject_all', 'save_preferences', 'withdraw'] as const;
export const LOG_PAGE = 50;

const HEAD = [
  'at',
  'anonymousId',
  'action',
  'functional',
  'analytics',
  'marketing',
  'policyVersion',
  'staleVersion',
  'locale',
  'page',
  'ipPrefix',
] as const;

/** The log as CSV; `page` is free text a visitor's browser sends, hence the formula-safe cells. */
export function consentLogCsv(rows: ConsentLogEntry[]): string {
  const lines = rows.map((r) =>
    [
      r.at,
      r.anonymousId,
      r.action,
      r.choices.functional,
      r.choices.analytics,
      r.choices.marketing,
      r.policyVersion,
      r.staleVersion,
      r.locale,
      r.page,
      r.ipPrefix,
    ]
      .map(csvCell)
      .join(','),
  );
  return [HEAD.join(','), ...lines].join('\n');
}

/** URL filters as the API query; dates widen to whole UTC days so the end date is included. */
export function consentLogQuery(p: { from: string; to: string; action: string; visitor: string }) {
  return {
    from: p.from ? `${p.from}T00:00:00.000Z` : undefined,
    to: p.to ? `${p.to}T23:59:59.999Z` : undefined,
    action: p.action || undefined,
    anonymousId: p.visitor.trim() || undefined,
  };
}
