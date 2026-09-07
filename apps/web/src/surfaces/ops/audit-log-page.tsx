import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@carrental/ui';
import { Fragment, useState } from 'react';

import { useAuditLog } from '../../lib/admin-hooks.js';

/**
 * SCREEN-OPS-038 — Audit & activity. An append-only view of consequential actions. Sensitive
 * values in the before/after snapshots are masked at write time (SRS-SEC-011); this screen never
 * un-masks them. Filter by action or target type; the API returns the newest 200 matches and the
 * table renders the most recent 120 of them (narrow the filter to reach older ones).
 */
export function AuditLogPage() {
  const [draft, setDraft] = useState({ action: '', targetType: '' });
  const [filter, setFilter] = useState<{ action?: string; targetType?: string }>({});
  const rows = useAuditLog(filter);
  const [expanded, setExpanded] = useState<string | null>(null);

  // the API returns up to 200; render a bounded slice so a busy log stays responsive
  const RENDER_CAP = 120;
  const visibleRows = rows.data?.slice(0, RENDER_CAP) ?? [];
  const hiddenCount = (rows.data?.length ?? 0) - visibleRows.length;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setFilter({
      action: draft.action.trim() || undefined,
      targetType: draft.targetType.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit &amp; activity</h1>
        <p className="text-sm text-muted-foreground">
          Every consequential action, in order, with who did it and a masked before/after. This log
          is append-only — entries are never edited or removed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
            <Field label="Action" htmlFor="aud-action" hint="e.g. config.version.approved">
              {({ id }) => (
                <Input
                  id={id}
                  data-testid="audit-action"
                  value={draft.action}
                  onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Target type" htmlFor="aud-target" hint="e.g. config_version">
              {({ id }) => (
                <Input
                  id={id}
                  data-testid="audit-target"
                  value={draft.targetType}
                  onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
                />
              )}
            </Field>
            <Button type="submit" data-testid="audit-apply">
              Apply
            </Button>
            {(filter.action || filter.targetType) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft({ action: '', targetType: '' });
                  setFilter({});
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : rows.isError ? (
            <AppStateView
              kind="failure"
              inline
              title="Couldn't load the audit log"
              primaryAction={{ label: 'Retry', onClick: () => rows.refetch() }}
            />
          ) : !rows.data?.length ? (
            <AppStateView kind="empty" inline title="No matching events" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm" data-testid="audit-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 pe-3 text-start font-medium">When</th>
                    <th className="py-1 pe-3 text-start font-medium">Actor</th>
                    <th className="py-1 pe-3 text-start font-medium">Action</th>
                    <th className="py-1 pe-3 text-start font-medium">Target</th>
                    <th className="py-1 pe-3 text-start font-medium">Outcome</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody data-testid="audit-rows">
                  {visibleRows.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="border-t align-top" data-action={r.action}>
                        <td className="py-2 pe-3 text-xs text-muted-foreground">
                          {new Date(r.occurredAt).toLocaleString()}
                        </td>
                        <td className="py-2 pe-3">{r.actor}</td>
                        <td className="py-2 pe-3 font-mono text-xs">{r.action}</td>
                        <td className="py-2 pe-3 text-xs">
                          {r.targetType ?? '—'}
                          {r.targetId ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {r.targetId.slice(0, 8)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pe-3">
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
                        </td>
                        <td className="py-2 text-end">
                          {r.before || r.after ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                            >
                              {expanded === r.id ? 'Hide' : 'Diff'}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                      {expanded === r.id ? (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                                  Before
                                </p>
                                <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                                  {JSON.stringify(r.before ?? {}, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                                  After
                                </p>
                                <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                                  {JSON.stringify(r.after ?? {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {hiddenCount > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the {RENDER_CAP} most recent — narrow the filter to see older events (
                  {hiddenCount} more match).
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
