import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useState } from 'react';

import {
  useCreateRestriction,
  useCustomerRecord,
  useCustomerSearch,
  useMergeCustomer,
  useRestrictionDecision,
  useUnmergeCustomer,
  type CustomerRecord,
} from '../../lib/admin-hooks.js';
import { formatMinor } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-OPS-021 / SCREEN-OPS-022 · FR-ADM-001 — customer record search + consolidated view
 * (read side). Search by a permitted identifier, then open one record: contact, status, saved
 * drivers, reservations, rentals, balance, open cases, and active eligibility restrictions
 * (FR-ADM-002, read-only here). Duplicate-merge and the restriction write workflow are a
 * documented follow-up.
 */
export function CustomersPage() {
  const { t, fmt } = useI18n();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const search = useCustomerSearch(q);
  const record = useCustomerRecord(sel);
  const r = record.data;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.cust.title')} description={t('ops.cust.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Card className="h-max">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.cust.search')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ops.cust.searchPlaceholder')}
              aria-label={t('ops.cust.search')}
              data-testid="cust-search"
            />
            {q.trim().length > 0 && q.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">{t('ops.cust.min2')}</p>
            ) : null}
            {search.isLoading ? (
              <AppStateView kind="loading" title={t('state.loading.title')} inline />
            ) : search.data ? (
              search.data.results.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('ops.cust.noResults')}</p>
              ) : (
                <ul className="space-y-1" data-testid="cust-results">
                  {search.data.results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSel(c.id)}
                        className={`w-full rounded-md border p-2 text-left text-sm ${
                          sel === c.id ? 'border-primary bg-muted' : ''
                        }`}
                        data-testid={`cust-hit-${c.id}`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="font-medium">{c.fullName}</span>
                          {c.restricted ? (
                            <Badge variant="warning">{t('ops.cust.restricted')}</Badge>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {c.email ?? c.phone ?? c.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t('ops.cust.startTyping')}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!sel ? (
            <AppStateView kind="empty" title={t('ops.cust.selectOne')} inline />
          ) : record.isLoading || !r ? (
            <AppStateView kind="loading" title={t('state.loading.title')} inline />
          ) : (
            <>
              <Card data-testid="cust-record">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {r.fullName}
                    <Badge variant={r.status === 'active' ? 'success' : 'neutral'}>
                      {r.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    {t('ops.cust.email')}: {r.email ?? '—'}
                  </div>
                  <div>
                    {t('ops.cust.phone')}: {r.phone ?? '—'}
                  </div>
                  <div>
                    {t('ops.cust.locale')}: {r.localeCode}
                  </div>
                  <div>
                    {t('ops.cust.balance')}:{' '}
                    <span className={r.balance.minor > 0 ? 'font-semibold text-destructive' : ''}>
                      {formatMinor(r.balance.minor, r.balance.currency)}
                    </span>
                  </div>
                  <div>
                    {t('ops.cust.consents')}:{' '}
                    {r.consents.map((c) => `${c.type} v${c.version}`).join(', ') || '—'}
                  </div>
                </CardContent>
              </Card>

              <RestrictionsCard customerId={r.id} record={r} />
              <MergeCard record={r} />

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {t('ops.cust.reservations')} ({r.reservations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {r.reservations.length === 0 ? (
                      <p className="text-muted-foreground">{t('ops.cust.none')}</p>
                    ) : (
                      r.reservations.slice(0, 10).map((x) => (
                        <div key={x.reference} className="flex justify-between">
                          <span className="tabular-nums">{x.reference}</span>
                          <span>
                            <Badge variant="neutral">{x.state}</Badge> {fmt.date(x.pickupAt)}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {t('ops.cust.drivers')} ({r.drivers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {r.drivers.length === 0 ? (
                      <p className="text-muted-foreground">{t('ops.cust.none')}</p>
                    ) : (
                      r.drivers.map((d) => (
                        <div key={d.id} className="flex justify-between">
                          <span>{d.fullName}</span>
                          <span className="text-muted-foreground">
                            {d.licenceNumber ?? '—'} {d.licenceCountry ?? ''}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {(r.rentals.length > 0 || r.openCases.length > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('ops.cust.activity')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {r.rentals.map((x) => (
                      <div key={x.reference} className="flex justify-between">
                        <span className="tabular-nums">{x.reference}</span>
                        <Badge variant="neutral">{x.state}</Badge>
                      </div>
                    ))}
                    {r.openCases.map((x) => (
                      <div key={x.id} className="flex justify-between text-destructive">
                        <span>{x.kind}</span>
                        <span>{x.subjectRef}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * FR-ADM-002 write side — create → a *different* manager approves → active (enforced at booking)
 * → lifted. `customer.manage` gates every action; the approve button is hidden for the author.
 */
function RestrictionsCard({ customerId, record }: { customerId: string; record: CustomerRecord }) {
  const { t } = useI18n();
  const { hasPermission, actor } = useAuth();
  const canManage = hasPermission('customer.manage');
  const create = useCreateRestriction(customerId);
  const decide = useRestrictionDecision(customerId);
  const [form, setForm] = useState({ category: 'block', scope: 'all', reasonCode: '' });
  const [error, setError] = useState<string | null>(null);

  const rows = record.restrictions;
  const hasActive = rows.some((x) => x.status === 'active');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        category: form.category as 'review' | 'block',
        scope: form.scope.trim() || 'all',
        reasonCode: form.reasonCode.trim() || undefined,
      });
      setForm({ category: 'block', scope: 'all', reasonCode: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ops.cust.rstrFail'));
    }
  }

  if (rows.length === 0 && !canManage) return null;

  return (
    <Card className={hasActive ? 'border-warning' : undefined} data-testid="cust-restrictions">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('ops.cust.restrictions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t('ops.cust.none')}</p>
        ) : (
          rows.map((x) => (
            <div
              key={x.id}
              className="flex flex-wrap items-center gap-2"
              data-testid={`rstr-${x.id}`}
            >
              <Badge variant={x.category === 'block' ? 'destructive' : 'warning'}>
                {x.category}
              </Badge>
              <Badge
                variant={
                  x.status === 'active'
                    ? 'destructive'
                    : x.status === 'pending_review'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {t(`ops.cust.rstrStatus.${x.status}`)}
              </Badge>
              <span className="font-mono text-xs">{x.scope}</span>
              <span className="text-muted-foreground">
                {x.reasonCode ?? t('ops.cust.noReason')}
              </span>
              {canManage && x.status === 'pending_review' ? (
                <>
                  {x.createdBy !== actor?.accountId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide.mutate({ rid: x.id, action: 'approve' })}
                      data-testid={`rstr-approve-${x.id}`}
                    >
                      {t('ops.cust.rstrApprove')}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('ops.cust.rstrOwnAuthor')}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decide.mutate({ rid: x.id, action: 'reject' })}
                  >
                    {t('ops.cust.rstrReject')}
                  </Button>
                </>
              ) : null}
              {canManage && x.status === 'active' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => decide.mutate({ rid: x.id, action: 'lift' })}
                  data-testid={`rstr-lift-${x.id}`}
                >
                  {t('ops.cust.rstrLift')}
                </Button>
              ) : null}
            </div>
          ))
        )}

        {canManage ? (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
            <label className="text-xs">
              {t('ops.cust.rstrCategory')}
              <select
                className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                data-testid="rstr-category"
              >
                <option value="block">block</option>
                <option value="review">review</option>
              </select>
            </label>
            <label className="text-xs">
              {t('ops.cust.rstrScope')}
              <Input
                className="mt-1 h-9 w-40"
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                placeholder="all"
                data-testid="rstr-scope"
              />
            </label>
            <label className="text-xs">
              {t('ops.cust.rstrReason')}
              <Input
                className="mt-1 h-9 w-40"
                value={form.reasonCode}
                onChange={(e) => setForm((f) => ({ ...f, reasonCode: e.target.value }))}
              />
            </label>
            <Button type="submit" size="sm" loading={create.isPending} data-testid="rstr-create">
              {t('ops.cust.rstrAdd')}
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * FR-ADM-001 duplicate handling — fold this record into another (reversible). Shown only to
 * `customer.manage`. A merged record shows where it went + an undo; a survivor shows its
 * merge history + an undo for the last un-reversed merge.
 */
function MergeCard({ record }: { record: CustomerRecord }) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customer.manage');
  const merge = useMergeCustomer(record.id);
  const unmerge = useUnmergeCustomer(record.id);
  const [intoId, setIntoId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;
  const isMerged = record.status === 'merged';
  const openMerges = record.mergeHistory.filter((m) => !m.reversedAt);

  return (
    <Card data-testid="cust-merge">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('ops.cust.mergeTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isMerged ? (
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{t('ops.cust.merged')}</Badge>
            <span className="font-mono text-xs">{record.mergedIntoId}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => unmerge.mutate()}
              data-testid="cust-unmerge"
            >
              {t('ops.cust.undoMerge')}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await merge.mutateAsync({
                  intoId: intoId.trim(),
                  reason: reason.trim() || undefined,
                });
                setIntoId('');
                setReason('');
              } catch (err) {
                setError(err instanceof Error ? err.message : t('ops.cust.mergeFail'));
              }
            }}
          >
            <label className="text-xs">
              {t('ops.cust.mergeInto')}
              <Input
                className="mt-1 h-9 w-72 font-mono"
                value={intoId}
                onChange={(e) => setIntoId(e.target.value)}
                placeholder={t('ops.cust.mergeIntoHint')}
                data-testid="cust-merge-into"
              />
            </label>
            <label className="text-xs">
              {t('ops.cust.mergeReason')}
              <Input
                className="mt-1 h-9 w-56"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              size="sm"
              disabled={!intoId.trim() || merge.isPending}
              data-testid="cust-merge-go"
            >
              {t('ops.cust.mergeGo')}
            </Button>
          </form>
        )}

        {record.mergeHistory.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground" data-testid="cust-merge-history">
            {record.mergeHistory.map((m) => (
              <li key={m.id}>
                {t('ops.cust.mergeAbsorbed', {
                  id: m.mergedId.slice(0, 8),
                  drivers: m.movedDrivers,
                  restrictions: m.movedRestrictions,
                })}
                {m.reversedAt ? ` · ${t('ops.cust.mergeReversed')}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {openMerges.length > 0 && !isMerged ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unmerge.mutate()}
            data-testid="cust-unmerge"
          >
            {t('ops.cust.undoLastMerge')}
          </Button>
        ) : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
