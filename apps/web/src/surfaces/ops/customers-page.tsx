import { useAuth, useDebounced } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  PageHeader,
  Select,
  useToast,
} from '@carrental/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { LookupSelect } from '../../components/lookup-select.js';
import {
  useCreateRestriction,
  useCustomerRecord,
  useCustomerSearch,
  useMergeCustomer,
  useRestrictionDecision,
  useUnmergeCustomer,
  type CustomerRecord,
} from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * SCREEN-OPS-021 / SCREEN-OPS-022 · FR-ADM-001/002 — customer record search + consolidated view.
 * Search by a permitted identifier, then open one record: contact, status, saved drivers,
 * reservations, rentals, balance, open cases, eligibility restrictions (create → a different
 * manager approves → active → lift), and the reversible duplicate merge. Every search and every
 * record view is a PII access recorded on the audit trail (SRS-SEC-016).
 */
export function CustomersPage() {
  const { t, fmt } = useI18n();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const debouncedQ = useDebounced(q);

  const search = useCustomerSearch(debouncedQ);
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
            ) : search.isError ? (
              <AppStateView
                kind="failure"
                inline
                title={t('ops.cust.searchFail')}
                primaryAction={{ label: t('ops.st.retry'), onClick: () => search.refetch() }}
              />
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
          ) : record.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.cust.loadRecordFail')}
              description={
                record.error instanceof ApiError && record.error.status === 404
                  ? t('ops.cust.noResults')
                  : undefined
              }
              primaryAction={{ label: t('ops.st.retry'), onClick: () => record.refetch() }}
            />
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
                      {fmt.money({
                        amountMinor: r.balance.minor,
                        currency: r.balance.currency,
                      })}
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
                        <div key={x.reference} className="flex justify-between gap-2">
                          <Link
                            to={`/work/${encodeURIComponent(x.reference)}`}
                            className="bidi-isolate font-mono text-xs text-primary hover:underline"
                          >
                            {x.reference}
                          </Link>
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
                      <div key={x.reference} className="flex justify-between gap-2">
                        <Link
                          to={`/rentals/${encodeURIComponent(x.reference)}`}
                          className="bidi-isolate font-mono text-xs text-primary hover:underline"
                        >
                          {x.reference}
                        </Link>
                        <Badge variant="neutral">{x.state}</Badge>
                      </div>
                    ))}
                    {r.openCases.map((x) => (
                      <div key={x.id} className="flex justify-between text-destructive">
                        <span>{x.kind.replace(/_/g, ' ')}</span>
                        <span className="bidi-isolate font-mono text-xs">{x.subjectRef}</span>
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
  const { toast } = useToast();
  const { hasPermission, actor } = useAuth();
  const canManage = hasPermission('customer.manage');
  const create = useCreateRestriction(customerId);
  const decide = useRestrictionDecision(customerId);
  const emptyForm = {
    category: 'block',
    scopeKind: 'all' as 'all' | 'category' | 'location',
    scopeValue: '',
    reasonCode: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | {
    rid: string;
    action: 'approve' | 'lift';
  }>(null);

  const rows = record.restrictions;
  const hasActive = rows.some((x) => x.status === 'active');
  const scopeValueValid =
    form.scopeKind === 'all' || /^[A-Za-z0-9_-]+$/.test(form.scopeValue.trim());
  const composedScope =
    form.scopeKind === 'all' ? 'all' : `${form.scopeKind}:${form.scopeValue.trim()}`;

  const runDecision = async (rid: string, action: 'approve' | 'reject' | 'lift') => {
    setError(null);
    try {
      await decide.mutateAsync({ rid, action });
      toast({
        title: t(
          action === 'approve'
            ? 'ops.cust.rstrApproved'
            : action === 'reject'
              ? 'ops.cust.rstrRejected'
              : 'ops.cust.rstrLifted',
        ),
        variant: 'success',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ops.cust.rstrFail'));
    } finally {
      setConfirm(null);
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!scopeValueValid) {
      setError(t('ops.cust.scopeValueHint'));
      return;
    }
    try {
      await create.mutateAsync({
        category: form.category as 'review' | 'block',
        scope: composedScope,
        reasonCode: form.reasonCode || undefined,
      });
      setForm(emptyForm);
      toast({ title: t('ops.cust.rstrCreated'), variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ops.cust.rstrFail'));
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
                      loading={decide.isPending && decide.variables?.rid === x.id}
                      disabled={decide.isPending}
                      onClick={() => setConfirm({ rid: x.id, action: 'approve' })}
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
                    loading={decide.isPending && decide.variables?.rid === x.id}
                    disabled={decide.isPending}
                    onClick={() => runDecision(x.id, 'reject')}
                  >
                    {t('ops.cust.rstrReject')}
                  </Button>
                </>
              ) : null}
              {canManage && x.status === 'active' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={decide.isPending && decide.variables?.rid === x.id}
                  disabled={decide.isPending}
                  onClick={() => setConfirm({ rid: x.id, action: 'lift' })}
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
              <Select
                className="mt-1 h-9 w-auto"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                data-testid="rstr-category"
              >
                <option value="block">{t('ops.cust.rstrCatBlock')}</option>
                <option value="review">{t('ops.cust.rstrCatReview')}</option>
              </Select>
            </label>
            <label className="text-xs">
              {t('ops.cust.scopeKind')}
              <Select
                className="mt-1 h-9 w-auto"
                value={form.scopeKind}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    scopeKind: e.target.value as typeof f.scopeKind,
                    scopeValue: '',
                  }))
                }
                data-testid="rstr-scope-kind"
              >
                <option value="all">{t('ops.cust.scopeAll')}</option>
                <option value="category">{t('ops.cust.scopeCategory')}</option>
                <option value="location">{t('ops.cust.scopeLocation')}</option>
              </Select>
            </label>
            {form.scopeKind !== 'all' ? (
              <label className="text-xs">
                {t('ops.cust.scopeValue')}
                <Input
                  className="mt-1 h-9 w-40"
                  value={form.scopeValue}
                  onChange={(e) => setForm((f) => ({ ...f, scopeValue: e.target.value }))}
                  placeholder={t('ops.cust.scopeValueHint')}
                  invalid={form.scopeValue.trim().length > 0 && !scopeValueValid}
                  data-testid="rstr-scope-value"
                />
              </label>
            ) : null}
            <label className="text-xs">
              {t('ops.cust.rstrReason')}
              <LookupSelect
                typeCode="restriction_reason"
                className="mt-1 h-9 w-48"
                value={form.reasonCode}
                onChange={(code) => setForm((f) => ({ ...f, reasonCode: code }))}
              />
            </label>
            <Button
              type="submit"
              size="sm"
              loading={create.isPending}
              disabled={!scopeValueValid || !form.reasonCode}
              data-testid="rstr-create"
            >
              {t('ops.cust.rstrAdd')}
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        destructive={confirm?.action === 'lift'}
        title={confirm?.action === 'lift' ? t('ops.cust.liftTitle') : t('ops.cust.approveTitle')}
        description={
          confirm?.action === 'lift' ? t('ops.cust.liftBody') : t('ops.cust.approveBody')
        }
        confirmLabel={
          confirm?.action === 'lift' ? t('ops.cust.rstrLift') : t('ops.cust.rstrApprove')
        }
        onConfirm={() => (confirm ? runDecision(confirm.rid, confirm.action) : undefined)}
      />
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
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customer.manage');
  const merge = useMergeCustomer(record.id);
  const unmerge = useUnmergeCustomer(record.id);
  const [intoId, setIntoId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmUnmerge, setConfirmUnmerge] = useState(false);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const intoValid = UUID.test(intoId.trim());

  const runUnmerge = async () => {
    setError(null);
    try {
      await unmerge.mutateAsync();
      toast({ title: t('ops.cust.unmergeDone'), variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ops.cust.mergeFail'));
    } finally {
      setConfirmUnmerge(false);
    }
  };

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
              onClick={() => setConfirmUnmerge(true)}
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
                toast({ title: t('ops.cust.mergeDone'), variant: 'success' });
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t('ops.cust.mergeFail'));
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
                aria-invalid={intoId.trim().length > 0 && !intoValid}
                data-testid="cust-merge-into"
              />
              {intoId.trim().length > 0 && !intoValid ? (
                <span className="mt-1 block text-xs text-destructive">
                  {t('ops.cust.mergeIntoInvalid')}
                </span>
              ) : null}
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
              disabled={!intoValid || merge.isPending}
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
            onClick={() => setConfirmUnmerge(true)}
            data-testid="cust-unmerge"
          >
            {t('ops.cust.undoLastMerge')}
          </Button>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <ConfirmDialog
        open={confirmUnmerge}
        onOpenChange={setConfirmUnmerge}
        destructive
        title={t('ops.cust.unmergeTitle')}
        description={t('ops.cust.unmergeBody')}
        confirmLabel={t('ops.cust.undoMerge')}
        onConfirm={runUnmerge}
      />
    </Card>
  );
}
