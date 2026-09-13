import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  useAuditActorSearch,
  useAuditLog,
  useAuditLogExport,
  type AuditActor,
  type AuditRow,
} from '../../lib/admin-hooks.js';

/** Common actions, for the filter's autocomplete — the field still accepts anything. */
const COMMON_ACTIONS = [
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
const OUTCOMES = ['', 'accepted', 'rejected', 'failed'] as const;
const SURFACES = ['', 'app-cweb', 'app-ops', 'worker', 'provider'] as const;
const PAGE = 50;

const draftFromParams = (p: URLSearchParams) => ({
  action: p.get('action') ?? '',
  targetType: p.get('targetType') ?? '',
  targetId: p.get('targetId') ?? '',
  outcome: p.get('outcome') ?? '',
  surface: p.get('surface') ?? '',
  from: p.get('from') ?? '',
  to: p.get('to') ?? '',
});

/** Typeahead for "filter by actor" — the trail only ever records a raw id, so searching by a
 *  name/email an admin actually knows was otherwise impossible without already having a row of
 *  theirs on screen to click. Lives outside the filter `<form>` (not the Enter/Apply flow — a
 *  pick here applies immediately, same as clicking an actor cell in the table does). */
function ActorSearchField({ onSelect }: { onSelect: (actor: AuditActor) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  const results = useAuditActorSearch(debounced);
  const showDropdown = open && debounced.trim().length >= 2;

  return (
    <div className="relative">
      <Field
        label={t('ops.audit.filterByActorName')}
        htmlFor="aud-actor-search"
        hint={t('ops.audit.actorSearchHint')}
      >
        {({ id }) => (
          <Input
            id={id}
            autoComplete="off"
            data-testid="audit-actor-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        )}
      </Field>
      {showDropdown ? (
        <div className="absolute z-10 mt-1 w-72 rounded-md border bg-background shadow-md">
          {results.isLoading ? (
            <p className="p-2 text-xs text-muted-foreground">{t('ops.st.loading')}</p>
          ) : !results.data?.length ? (
            <p className="p-2 text-xs text-muted-foreground">{t('ops.audit.noActorMatch')}</p>
          ) : (
            <ul>
              {results.data.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start text-sm hover:bg-muted"
                    // keeps focus on the input through the click so `onBlur` above doesn't close
                    // the dropdown before this handler fires
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(a);
                      setQ('');
                      setDebounced('');
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="ms-1.5 text-xs text-muted-foreground">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function toCsv(rows: AuditRow[]): string {
  const head = [
    'occurredAt',
    'actor',
    'actorId',
    'action',
    'targetType',
    'targetId',
    'outcome',
    'reason',
    'surface',
  ];
  // CSV/formula injection (OWASP): a cell opening with =, +, -, or @ runs as a live formula the
  // moment this file is opened in Excel/Sheets — actor/reason/targetId are all free text an
  // attacker could influence. A leading apostrophe forces "treat as text" in both, and is
  // otherwise invisible, applied before the unconditional quote-wrap below.
  const esc = (v: unknown) => {
    const raw = String(v ?? '');
    const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [
      r.occurredAt,
      r.actor,
      r.actorId,
      r.action,
      r.targetType,
      r.targetId,
      r.outcome,
      r.reason,
      r.surface,
    ]
      .map(esc)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

/**
 * SCREEN-OPS-038 — Audit & activity. An append-only view of consequential actions. Sensitive
 * values in the before/after snapshots are masked at write time (SRS-SEC-011); this screen never
 * un-masks them. Every filter drives the URL query string (`action`/`targetType`/`targetId`/
 * `actorId`/`outcome`/`surface`/`from`/`to`), so this page is a valid deep-link target for any
 * filter combination — pagination position itself is deliberately local state, not URL, since a
 * keyset cursor only means anything relative to how you got there (see below). Other screens can
 * link straight to "this record's history" (see the Staff & roles page's
 * "History" action), and every row's Actor / Target cell is itself a drill-down: clicking either
 * sets that filter in place, so investigating "who else touched this record" or "what else did
 * this person do" never requires copying an id by hand.
 */
export function AuditLogPage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  // Keyset pagination position lives in local state, not the URL — a cursor only means anything
  // relative to how you got there (see `report.service.ts#auditLog`'s docstring on why keyset
  // was worth it over offset), so unlike the filter fields there's no honest way to make "page 4"
  // independently bookmarkable. `cursorStack[i]` is the cursor that fetched page `i + 2` (page 1
  // has none); its length also doubles as "how many full pages behind us" for the Showing X–Y
  // count below, since a page only ever gets pushed after being confirmed full (it had a
  // `nextCursor`).
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const filter = {
    action: params.get('action') ?? undefined,
    targetType: params.get('targetType') ?? undefined,
    targetId: params.get('targetId') ?? undefined,
    actorId: params.get('actorId') ?? undefined,
    outcome: params.get('outcome') ?? undefined,
    surface: params.get('surface') ?? undefined,
    from: params.get('from') ? `${params.get('from')}T00:00:00.000Z` : undefined,
    to: params.get('to') ? `${params.get('to')}T23:59:59.999Z` : undefined,
    limit: PAGE,
    cursor: cursorStack[cursorStack.length - 1],
  };
  const [draft, setDraft] = useState(() => draftFromParams(params));
  // keeps the form in sync whenever the URL changes from somewhere *other* than this form —
  // a row's Actor/Target drill-down, the Staff & roles "History" link, browser back/forward —
  // and returns to page 1, since every one of those is "the filter changed" (pagination
  // position is no longer part of `params` at all, so this is never fighting a page change).
  // Without the draft part, the filter fields could show stale values while the table (which
  // reads `params` directly, not `draft`) had already moved on, and re-submitting the form
  // would silently undo the drill-down.
  useEffect(() => {
    setDraft(draftFromParams(params));
    setCursorStack([]);
  }, [params]);
  const log = useAuditLog(filter);
  const exportMut = useAuditLogExport();
  const [expanded, setExpanded] = useState<string | null>(null);

  async function downloadCsv() {
    try {
      const { entries, truncated } = await exportMut.mutateAsync({
        action: filter.action,
        targetType: filter.targetType,
        targetId: filter.targetId,
        actorId: filter.actorId,
        outcome: filter.outcome,
        surface: filter.surface,
        from: filter.from,
        to: filter.to,
      });
      const blob = new Blob([toCsv(entries)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast({ title: t('ops.audit.exportTruncated', { n: entries.length }) });
      } else {
        toast({ title: t('ops.audit.exportDone', { n: entries.length }), variant: 'success' });
      }
    } catch {
      toast({ title: t('ops.audit.exportFail') });
    }
  }

  const hasFilter = !!(
    filter.action ||
    filter.targetType ||
    filter.targetId ||
    filter.actorId ||
    filter.outcome ||
    filter.surface ||
    filter.from ||
    filter.to
  );

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(draft)) {
          if (v.trim()) p.set(k, v.trim());
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  }

  function goNext() {
    if (log.data?.nextCursor) setCursorStack((s) => [...s, log.data!.nextCursor!]);
  }
  function goPrev() {
    setCursorStack((s) => s.slice(0, -1));
  }

  /** Row drill-downs: set one filter dimension, keep everything else — "refine to this
   *  actor/target", not "start over" (pagination position resets regardless — see the effect
   *  above — since narrowing the filter makes whatever page you were on meaningless anyway). */
  function setParam(key: string, value: string | null) {
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  }
  function filterByTarget(targetType: string, targetId: string) {
    setParams(
      (p) => {
        p.set('targetType', targetType);
        p.set('targetId', targetId);
        return p;
      },
      { replace: true },
    );
  }

  type Event = NonNullable<typeof log.data>['entries'][number];
  const columns: Array<DataTableColumn<Event>> = [
    {
      key: 'when',
      header: t('ops.audit.hWhen'),
      cell: (r) => fmt.dateTime(r.occurredAt),
      className: 'whitespace-nowrap pe-3 text-xs text-muted-foreground',
    },
    {
      key: 'actor',
      header: t('ops.audit.hActor'),
      cell: (r) =>
        r.actorId ? (
          <button
            type="button"
            className="text-start text-primary hover:underline"
            title={t('ops.audit.filterByActor')}
            onClick={() => setParam('actorId', r.actorId)}
          >
            {r.actor}
          </button>
        ) : (
          r.actor
        ),
      className: 'pe-3',
    },
    {
      key: 'action',
      header: t('ops.audit.hAction'),
      cell: (r) => r.action,
      className: 'pe-3 font-mono text-xs',
    },
    {
      key: 'target',
      header: t('ops.audit.hTarget'),
      cell: (r) =>
        r.targetType && r.targetId ? (
          <button
            type="button"
            className="text-start text-primary hover:underline"
            title={t('ops.audit.filterByTarget')}
            onClick={() => filterByTarget(r.targetType!, r.targetId!)}
          >
            {r.targetType}
            <span className="text-muted-foreground"> · {r.targetId.slice(0, 8)}</span>
          </button>
        ) : (
          <span>{r.targetType ?? '—'}</span>
        ),
      className: 'pe-3 text-xs',
    },
    {
      key: 'outcome',
      header: t('ops.audit.hOutcome'),
      cell: (r) => (
        <Badge
          variant={
            r.outcome === 'accepted'
              ? 'success'
              : r.outcome === 'rejected'
                ? 'warning'
                : 'destructive'
          }
        >
          {r.outcome}
        </Badge>
      ),
      className: 'pe-3',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (r) =>
        r.before || r.after || r.reason ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            {expanded === r.id ? t('ops.audit.hide') : t('ops.audit.diff')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.audit.title')} description={t('ops.audit.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.audit.filter')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
            <datalist id="audit-actions">
              {COMMON_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <Field
              label={t('ops.audit.filterAction')}
              htmlFor="aud-action"
              hint={t('ops.audit.actionHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  list="audit-actions"
                  data-testid="audit-action"
                  value={draft.action}
                  onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
                />
              )}
            </Field>
            <Field
              label={t('ops.audit.filterTarget')}
              htmlFor="aud-target"
              hint={t('ops.audit.targetHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  data-testid="audit-target"
                  value={draft.targetType}
                  onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
                />
              )}
            </Field>
            <Field
              label={t('ops.audit.filterTargetId')}
              htmlFor="aud-target-id"
              hint={t('ops.audit.targetIdHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  data-testid="audit-target-id"
                  className="font-mono"
                  value={draft.targetId}
                  onChange={(e) => setDraft((d) => ({ ...d, targetId: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('ops.audit.filterOutcome')} htmlFor="aud-outcome">
              {({ id }) => (
                <select
                  id={id}
                  data-testid="audit-outcome"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={draft.outcome}
                  onChange={(e) => setDraft((d) => ({ ...d, outcome: e.target.value }))}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o ? t(`ops.audit.outcome.${o}`) : t('ops.audit.allOutcomes')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.audit.filterSurface')} htmlFor="aud-surface">
              {({ id }) => (
                <select
                  id={id}
                  data-testid="audit-surface"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={draft.surface}
                  onChange={(e) => setDraft((d) => ({ ...d, surface: e.target.value }))}
                >
                  {SURFACES.map((s) => (
                    <option key={s} value={s}>
                      {s ? t(`ops.audit.surface.${s}`) : t('ops.audit.allSurfaces')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.search.from')} htmlFor="aud-from">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('ops.search.to')} htmlFor="aud-to">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                />
              )}
            </Field>
            <Button type="submit" data-testid="audit-apply">
              {t('ops.audit.apply')}
            </Button>
            {hasFilter && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setParams({}, { replace: true })}
              >
                {t('ops.st.clear')}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={downloadCsv}
              loading={exportMut.isPending}
              disabled={!log.data?.entries.length}
            >
              {t('ops.audit.export')}
            </Button>
          </form>
          {filter.actorId ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('ops.audit.actorIdFiltered')}{' '}
              <button type="button" className="underline" onClick={() => setParam('actorId', null)}>
                {t('ops.st.clear')}
              </button>
            </p>
          ) : (
            <div className="mt-3 max-w-xs">
              <ActorSearchField onSelect={(a) => setParam('actorId', a.id)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.audit.events')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={log.data?.entries}
            rowKey={(r) => r.id}
            isLoading={log.isLoading}
            isError={log.isError}
            onRetry={() => log.refetch()}
            rowProps={(r) => ({ 'data-action': r.action })}
            rowClassName="align-top"
            testid="audit-table"
            bodyTestid="audit-rows"
            minWidth="44rem"
            renderSubRow={(r) =>
              expanded === r.id ? (
                <div className="space-y-3 bg-muted/30 p-3">
                  {r.reason ? (
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">
                        {t('ops.audit.reason')}:
                      </span>{' '}
                      {r.reason}
                    </p>
                  ) : null}
                  {r.before || r.after ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                          {t('ops.audit.before')}
                        </p>
                        <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                          {JSON.stringify(r.before ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                          {t('ops.audit.after')}
                        </p>
                        <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                          {JSON.stringify(r.after ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null
            }
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.audit.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.audit.empty'),
            }}
          />
          {log.data ? (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {log.data.total
                  ? t('ops.audit.showing', {
                      // every page in `cursorStack`'s history was, by construction, a full page
                      // (it only got pushed because it had a `nextCursor`) — so this stays exact
                      // at any depth, the same as the old offset math did, just derived from how
                      // many pages we've advanced through instead of a literal row offset.
                      from: cursorStack.length * PAGE + 1,
                      to: cursorStack.length * PAGE + log.data.entries.length,
                      total: log.data.total,
                    })
                  : t('ops.audit.empty')}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cursorStack.length === 0}
                  onClick={goPrev}
                >
                  {t('ops.audit.prev')}
                </Button>
                <Button size="sm" variant="ghost" disabled={!log.data.nextCursor} onClick={goNext}>
                  {t('ops.audit.next')}
                </Button>
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
