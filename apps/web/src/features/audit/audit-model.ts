import type { AuditRow } from '@/lib/admin-hooks';

export const COMMON_ACTIONS = [
  'ops.search',
  'customer.searched',
  'reservation.cancelled',
  'reservation.modified',
  'reservation.no_show',
  'payment.reconciled',
  'payment.refund',
  'fleet.block.opened',
  'fleet.unit.transferred',
  'recovery_case.retried',
  'config.published',
  'iam.staff.invited',
];
export const OUTCOMES = ['accepted', 'rejected', 'failed'] as const;
export const SURFACES = ['app-cweb', 'app-ops', 'worker', 'provider'] as const;
export const PAGE = 50;

const HEAD = [
  'occurredAt',
  'actor',
  'actorId',
  'action',
  'targetType',
  'targetId',
  'outcome',
  'reason',
  'surface',
] as const;

/**
 * CSV cell escaping. A cell opening with `=`, `+`, `-` or `@` runs as a live formula the moment
 * the file is opened in Excel or Sheets (CSV injection, OWASP) — actor, reason and target id are
 * free text someone could influence — so a leading apostrophe forces "text" in both.
 */
export function csvCell(v: unknown): string {
  const raw = String(v ?? '');
  const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: AuditRow[]): string {
  const lines = rows.map((r) => HEAD.map((k) => csvCell(r[k])).join(','));
  return [HEAD.join(','), ...lines].join('\n');
}

/** Filters the URL carries, as the API query (dates widened to whole days in UTC). */
export function toQuery(p: Record<string, unknown>) {
  const str = (k: string) => (typeof p[k] === 'string' && p[k] ? (p[k] as string) : undefined);
  return {
    action: str('action'),
    targetType: str('targetType'),
    targetId: str('targetId'),
    actorId: str('actorId'),
    outcome: str('outcome'),
    surface: str('surface'),
    from: str('from') ? `${str('from')}T00:00:00.000Z` : undefined,
    to: str('to') ? `${str('to')}T23:59:59.999Z` : undefined,
  };
}

/** "Showing a–b of n" for keyset paging: every page behind us was full (it only had a cursor because it was). */
export const shownRange = (pagesBehind: number, onPage: number) => ({
  from: pagesBehind * PAGE + 1,
  to: pagesBehind * PAGE + onPage,
});
