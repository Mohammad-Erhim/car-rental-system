import { useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataTable,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useMemo, useState } from 'react';

import { LookupSelect } from '../../components/lookup-select.js';
import { ApiError } from '../../lib/api.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import {
  useDeleteRatePlan,
  useOpsCategories,
  usePublishRatePlan,
  useRatePlans,
  useSaveRatePlan,
  type RatePlan,
  type RatePlanInput,
} from '../../lib/ops-discovery-hooks.js';

/**
 * SCREEN-OPS-025/026 — Rate plans. Draft → publish; a published plan is immutable (create a new
 * one to change a price). Publishing supersedes only the published plans it overlaps in time and
 * takes effect on customer search with no redeploy (§12.5: the publish confirm shows the effect).
 */
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const toMinor = (s: string) => Math.round(num(s) * 100);
const fromMinor = (m: number) => (m / 100).toFixed(2);

const EMPTY: FormState = {
  id: null,
  categoryCode: '',
  name: '',
  scope: '',
  currency: 'USD',
  effectiveFrom: today(),
  effectiveTo: '',
  baseDay: '',
  hour: '',
  taxPct: '20',
  minDuration: '24',
  maxDuration: '',
  fees: [],
  tiers: [],
};

interface FormState {
  id: string | null;
  categoryCode: string;
  name: string;
  scope: string; // '' = all locations, else a locationCode
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  baseDay: string;
  hour: string;
  taxPct: string;
  minDuration: string;
  maxDuration: string;
  fees: Array<{ code: string; label: string; amount: string; taxable: boolean }>;
  tiers: Array<{ minHours: string; day: string }>;
}

function planToForm(p: RatePlan): FormState {
  return {
    id: p.id,
    categoryCode: p.categoryCode,
    name: p.name,
    scope: p.locationCode ?? '',
    currency: p.currency,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo ?? '',
    baseDay: fromMinor(p.baseDayMinor),
    hour: p.hourMinor ? fromMinor(p.hourMinor) : '',
    taxPct: String(p.taxBps / 100),
    minDuration: String(p.minDurationHours),
    maxDuration: p.maxDurationHours == null ? '' : String(p.maxDurationHours),
    fees: p.fees.map((f) => ({
      code: f.code,
      label: f.label,
      amount: fromMinor(f.amountMinor),
      taxable: f.taxable ?? true,
    })),
    tiers: p.tiers.map((t) => ({ minHours: String(t.minHours), day: fromMinor(t.dayMinor) })),
  };
}

export function RatePlansPage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const plans = useRatePlans();
  const cats = useOpsCategories();
  const locs = useLocations();
  const save = useSaveRatePlan();
  const publish = usePublishRatePlan();
  const del = useDeleteRatePlan();
  const errs = useFormErrors({
    baseDayMinor: t('ops.rp.baseDay'),
    name: t('ops.rp.name'),
    categoryCode: t('ops.rp.category'),
    locationCode: t('ops.rp.scope'),
    currency: t('ops.rp.currency'),
    effectiveTo: t('ops.rp.effectiveTo'),
    maxDurationHours: t('ops.rp.maxDuration'),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [showRetired, setShowRetired] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmPublish, setConfirmPublish] = useState<RatePlan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RatePlan | null>(null);

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const allPlans = plans.data ?? [];
  const visible = showRetired ? allPlans : allPlans.filter((p) => p.status !== 'retired');

  // active categories with no currently-effective published plan → invisible on customer search
  const unpriced = useMemo(() => {
    const d = today();
    const covered = new Set(
      allPlans
        .filter(
          (p) =>
            p.status === 'published' &&
            p.effectiveFrom <= d &&
            (!p.effectiveTo || p.effectiveTo >= d),
        )
        .map((p) => p.categoryCode),
    );
    return (cats.data ?? []).filter((c) => !covered.has(c.code));
  }, [allPlans, cats.data]);

  const locName = (code: string | null) =>
    code ? (locs.data?.find((l) => l.code === code)?.name ?? code) : t('ops.rp.allLocations');

  /** published plans the given plan would supersede on publish (same scope, overlapping range) */
  const wouldReplace = (p: RatePlan) => {
    const FAR = '9999-12-31';
    return allPlans.filter(
      (o) =>
        o.id !== p.id &&
        o.status === 'published' &&
        o.categoryCode === p.categoryCode &&
        (o.locationCode ?? null) === (p.locationCode ?? null) &&
        o.effectiveFrom <= (p.effectiveTo ?? FAR) &&
        p.effectiveFrom <= (o.effectiveTo ?? FAR),
    );
  };

  function validate(): boolean {
    const local: Array<{ path: string; code: string }> = [];
    if (!form.name.trim()) local.push({ path: 'name', code: 'required' });
    if (!form.categoryCode) local.push({ path: 'categoryCode', code: 'required' });
    if (!Number.isFinite(num(form.baseDay)) || num(form.baseDay) <= 0)
      local.push({ path: 'baseDayMinor', code: 'must_be_positive' });
    if (form.hour.trim() && (!Number.isFinite(num(form.hour)) || num(form.hour) < 0))
      local.push({ path: 'hourMinor', code: 'invalid' });
    const tax = num(form.taxPct);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100)
      local.push({ path: 'taxBps', code: 'out_of_range' });
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom)
      local.push({ path: 'effectiveTo', code: 'before_from' });
    const min = num(form.minDuration);
    if (!Number.isFinite(min) || min < 1) local.push({ path: 'minDurationHours', code: 'invalid' });
    if (form.maxDuration.trim()) {
      const max = num(form.maxDuration);
      if (!Number.isFinite(max) || max < min)
        local.push({ path: 'maxDurationHours', code: 'less_than_min' });
    }
    form.fees.forEach((fee, i) => {
      if (
        (fee.code.trim() || fee.label.trim() || fee.amount.trim()) &&
        (!fee.code.trim() || !fee.label.trim() || !Number.isFinite(num(fee.amount)))
      )
        local.push({ path: `fees.${i}`, code: 'incomplete' });
    });
    form.tiers.forEach((tier, i) => {
      if (
        !Number.isFinite(num(tier.minHours)) ||
        num(tier.minHours) < 1 ||
        !Number.isFinite(num(tier.day)) ||
        num(tier.day) <= 0
      )
        local.push({ path: `tiers.${i}`, code: 'invalid' });
    });
    if (local.length) {
      errs.setLocal(local);
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    if (!validate()) return;
    const body: RatePlanInput = {
      id: form.id ?? undefined,
      categoryCode: form.categoryCode,
      name: form.name.trim(),
      locationCode: form.scope || null,
      currency: form.currency,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      baseDayMinor: toMinor(form.baseDay),
      hourMinor: form.hour.trim() ? toMinor(form.hour) : 0,
      minDurationHours: Math.round(num(form.minDuration)),
      maxDurationHours: form.maxDuration.trim() ? Math.round(num(form.maxDuration)) : null,
      taxBps: Math.round(num(form.taxPct) * 100),
      fees: form.fees
        .filter((f) => f.code.trim())
        .map((f) => ({
          code: f.code.trim(),
          label: f.label.trim(),
          amountMinor: toMinor(f.amount),
          taxable: f.taxable,
        })),
      tiers: form.tiers
        .filter((t) => t.minHours.trim())
        .map((t) => ({ minHours: Math.round(num(t.minHours)), dayMinor: toMinor(t.day) })),
    };
    try {
      await save.mutateAsync(body);
      toast({ title: form.id ? t('ops.rp.updated') : t('ops.rp.created'), variant: 'success' });
      setForm(EMPTY);
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function doPublish() {
    if (!confirmPublish) return;
    try {
      await publish.mutateAsync(confirmPublish.id);
      toast({ title: t('ops.rp.published', { name: confirmPublish.name }), variant: 'success' });
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : t('ops.rp.publishFail') });
      throw err; // keep the confirm open
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      toast({ title: t('ops.rp.deleted'), variant: 'success' });
      if (form.id === confirmDelete.id) setForm(EMPTY);
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : t('ops.rp.actionFail') });
      throw err;
    }
  }

  const feeCount = (p: RatePlan) => p.fees.length;
  const editableStatus = (s: RatePlan['status']) => s === 'draft' || s === 'in_review';

  type Row = RatePlan;
  const columns: Array<DataTableColumn<Row>> = [
    {
      key: 'name',
      header: t('ops.rp.name'),
      cell: (p) => (
        <button
          type="button"
          className="text-start hover:underline"
          onClick={() =>
            setExpanded((s) => {
              const n = new Set(s);
              if (n.has(p.id)) n.delete(p.id);
              else n.add(p.id);
              return n;
            })
          }
        >
          {p.name}
        </button>
      ),
    },
    {
      key: 'category',
      header: t('ops.tbl.category'),
      cell: (p) => p.categoryCode,
      className: 'font-mono text-xs',
    },
    {
      key: 'scope',
      header: t('ops.rp.scope'),
      cell: (p) => locName(p.locationCode),
      className: 'text-xs',
    },
    {
      key: 'baseDay',
      header: t('ops.tbl.baseDay'),
      cell: (p) => money(p.baseDayMinor, p.currency),
    },
    { key: 'tax', header: t('ops.tbl.tax'), cell: (p) => `${+(p.taxBps / 100).toFixed(2)}%` },
    {
      key: 'effective',
      header: t('ops.rp.effectiveFrom'),
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {fmt.date(p.effectiveFrom)}
          {p.effectiveTo ? ` – ${fmt.date(p.effectiveTo)}` : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (p) => (
        <Badge
          variant={
            p.status === 'published' ? 'success' : p.status === 'retired' ? 'neutral' : 'warning'
          }
        >
          {t(`ops.cfg.state.${p.status}`)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (p) => (
        <span className="flex justify-end gap-1">
          {editableStatus(p.status) ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(planToForm(p));
                  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }}
                data-testid={`rp-edit-${p.id}`}
              >
                {t('ops.rp.editDraft')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)}>
                {t('ops.rp.deleteDraft')}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmPublish(p)}
                data-testid={`rp-publish-${p.id}`}
              >
                {t('ops.rp.publish')}
              </Button>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.rp.title')} description={t('ops.rp.subtitle')} />

      {unpriced.length ? (
        <Alert variant="warning" data-testid="rp-unpriced">
          <AlertTitle>{t('ops.rp.unpricedTitle')}</AlertTitle>
          <AlertDescription>
            {t('ops.rp.unpriced', { cats: unpriced.map((c) => c.displayName).join(', ') })}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t('ops.rp.card')}</CardTitle>
          <label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={showRetired}
              onChange={(e) => setShowRetired(e.target.checked)}
              data-testid="rp-show-retired"
            />
            {t('ops.rp.showRetired')}
          </label>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(p) => p.id}
            isLoading={plans.isLoading}
            isError={plans.isError}
            onRetry={() => plans.refetch()}
            rowProps={(p) => ({ 'data-plan': p.name, 'data-status': p.status })}
            testid="rate-plan-table"
            bodyTestid="rate-plan-rows"
            minWidth="48rem"
            renderSubRow={(p) =>
              expanded.has(p.id) ? (
                <div className="space-y-2 bg-muted/40 px-4 py-3 text-sm">
                  <p>
                    {t('ops.rp.durationRange', {
                      min: p.minDurationHours,
                      max: p.maxDurationHours ?? '∞',
                    })}
                    {' · '}
                    {t('ops.rp.extraHour')}: {p.hourMinor ? money(p.hourMinor, p.currency) : '—'}
                    {' · '}
                    {p.currency}
                  </p>
                  {p.fees.length ? (
                    <div>
                      <span className="font-medium">{t('ops.rp.fees')}:</span>{' '}
                      {p.fees
                        .map(
                          (f) =>
                            `${f.label} ${money(f.amountMinor, p.currency)}${f.taxable === false ? '' : ` (${t('ops.rp.feeTaxable')})`}`,
                        )
                        .join('; ')}
                    </div>
                  ) : null}
                  {p.tiers.length ? (
                    <div>
                      <span className="font-medium">{t('ops.rp.tiers')}:</span>{' '}
                      {p.tiers
                        .map((tr) => `≥ ${tr.minHours}h → ${money(tr.dayMinor, p.currency)}/day`)
                        .join('; ')}
                    </div>
                  ) : null}
                </div>
              ) : null
            }
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.rp.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.rp.empty'),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {form.id ? t('ops.rp.editing', { name: form.name }) : t('ops.rp.newDraft')}
          </CardTitle>
          {form.id ? (
            <Button size="sm" variant="ghost" onClick={() => setForm(EMPTY)}>
              {t('ops.rp.cancelEdit')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field
              label={t('ops.rp.category')}
              htmlFor="rp-category"
              required
              error={errs.fieldError('categoryCode')}
            >
              {({ id, invalid }) => (
                <Select
                  id={id}
                  invalid={invalid}
                  value={form.categoryCode}
                  onChange={(e) => set({ categoryCode: e.target.value })}
                >
                  <option value="">{t('ops.rp.chooseCategory')}</option>
                  {(cats.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.displayName} ({c.code})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t('ops.rp.name')}
              htmlFor="rp-name"
              required
              error={errs.fieldError('name')}
            >
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              )}
            </Field>

            <Field
              label={t('ops.rp.scope')}
              htmlFor="rp-scope"
              error={errs.fieldError('locationCode')}
            >
              {({ id }) => (
                <Select id={id} value={form.scope} onChange={(e) => set({ scope: e.target.value })}>
                  <option value="">{t('ops.rp.allLocations')}</option>
                  {(locs.data ?? []).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t('ops.rp.currency')}
              htmlFor="rp-currency"
              error={errs.fieldError('currency')}
            >
              {({ id, describedBy, invalid }) => (
                <LookupSelect
                  typeCode="currency"
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={form.currency}
                  onChange={(code) => set({ currency: code })}
                />
              )}
            </Field>

            <Field
              label={t('ops.rp.baseDay')}
              htmlFor="rp-base"
              required
              hint={t('ops.rp.baseDayHint')}
              error={errs.fieldError('baseDayMinor')}
            >
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  inputMode="decimal"
                  value={form.baseDay}
                  onChange={(e) => set({ baseDay: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('ops.rp.extraHour')} htmlFor="rp-hour" hint={t('ops.rp.extraHourHint')}>
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={form.hour}
                  onChange={(e) => set({ hour: e.target.value })}
                />
              )}
            </Field>

            <Field label={t('ops.rp.taxPct')} htmlFor="rp-tax">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={form.taxPct}
                  onChange={(e) => set({ taxPct: e.target.value })}
                />
              )}
            </Field>
            <div />

            <Field
              label={t('ops.rp.effectiveFrom')}
              htmlFor="rp-from"
              hint={t('ops.rp.effectiveFromHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.effectiveFrom}
                  min={form.id ? undefined : today()}
                  onChange={(e) => set({ effectiveFrom: e.target.value })}
                />
              )}
            </Field>
            <Field
              label={t('ops.rp.effectiveTo')}
              htmlFor="rp-to"
              hint={t('ops.rp.effectiveToHint')}
              error={errs.fieldError('effectiveTo')}
            >
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  type="date"
                  value={form.effectiveTo}
                  min={form.effectiveFrom}
                  onChange={(e) => set({ effectiveTo: e.target.value })}
                />
              )}
            </Field>

            <Field label={t('ops.rp.minDuration')} htmlFor="rp-min">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={form.minDuration}
                  onChange={(e) => set({ minDuration: e.target.value })}
                />
              )}
            </Field>
            <Field
              label={t('ops.rp.maxDuration')}
              htmlFor="rp-max"
              hint={t('ops.rp.maxDurationHint')}
              error={errs.fieldError('maxDurationHours')}
            >
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  inputMode="numeric"
                  value={form.maxDuration}
                  onChange={(e) => set({ maxDuration: e.target.value })}
                />
              )}
            </Field>

            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{t('ops.rp.fees')}</legend>
              {form.fees.map((fee, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-28"
                    placeholder={t('ops.rp.feeCode')}
                    value={fee.code}
                    onChange={(e) =>
                      set({
                        fees: form.fees.map((x, j) =>
                          j === i ? { ...x, code: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    className="w-40"
                    placeholder={t('ops.rp.feeLabel')}
                    value={fee.label}
                    onChange={(e) =>
                      set({
                        fees: form.fees.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    className="w-24"
                    inputMode="decimal"
                    placeholder={t('ops.rp.feeAmount')}
                    value={fee.amount}
                    onChange={(e) =>
                      set({
                        fees: form.fees.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={fee.taxable}
                      onChange={(e) =>
                        set({
                          fees: form.fees.map((x, j) =>
                            j === i ? { ...x, taxable: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    {t('ops.rp.feeTaxable')}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => set({ fees: form.fees.filter((_, j) => j !== i) })}
                  >
                    {t('ops.rp.remove')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set({ fees: [...form.fees, { code: '', label: '', amount: '', taxable: true }] })
                }
              >
                {t('ops.rp.addFee')}
              </Button>
            </fieldset>

            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{t('ops.rp.tiers')}</legend>
              <p className="text-xs text-muted-foreground">{t('ops.rp.tiersHint')}</p>
              {form.tiers.map((tier, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-32"
                    inputMode="numeric"
                    placeholder={t('ops.rp.tierMinHours')}
                    value={tier.minHours}
                    onChange={(e) =>
                      set({
                        tiers: form.tiers.map((x, j) =>
                          j === i ? { ...x, minHours: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    placeholder={t('ops.rp.tierRate')}
                    value={tier.day}
                    onChange={(e) =>
                      set({
                        tiers: form.tiers.map((x, j) =>
                          j === i ? { ...x, day: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => set({ tiers: form.tiers.filter((_, j) => j !== i) })}
                  >
                    {t('ops.rp.remove')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set({ tiers: [...form.tiers, { minHours: '', day: '' }] })}
              >
                {t('ops.rp.addTier')}
              </Button>
            </fieldset>

            <div className="sm:col-span-2">
              <Button type="submit" loading={save.isPending} data-testid="rate-plan-create">
                {form.id ? t('ops.rp.saveDraft') : t('ops.rp.createDraft')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmPublish}
        onOpenChange={(v) => !v && setConfirmPublish(null)}
        title={t('ops.rp.publishTitle')}
        description={
          confirmPublish ? (
            <div className="space-y-2 text-sm">
              <p>
                {t('ops.rp.publishEffect', {
                  category: confirmPublish.categoryCode,
                  scope: locName(confirmPublish.locationCode),
                  from: fmt.date(confirmPublish.effectiveFrom),
                })}
              </p>
              <p className="text-muted-foreground">
                {t('ops.rp.publishBase', {
                  price: money(confirmPublish.baseDayMinor, confirmPublish.currency),
                  tax: +(confirmPublish.taxBps / 100).toFixed(2),
                  fees: feeCount(confirmPublish),
                  tiers: confirmPublish.tiers.length,
                })}
              </p>
              <p>
                {wouldReplace(confirmPublish).length
                  ? t('ops.rp.publishReplaces', {
                      names: wouldReplace(confirmPublish)
                        .map((o) => o.name)
                        .join(', '),
                    })
                  : t('ops.rp.publishReplacesNone')}
              </p>
              <p className="text-muted-foreground">{t('ops.rp.publishImmutable')}</p>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel={t('ops.rp.publish')}
        onConfirm={doPublish}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title={t('ops.rp.deleteTitle')}
        description={t('ops.rp.deleteBody', { name: confirmDelete?.name ?? '' })}
        confirmLabel={t('ops.rp.deleteDraft')}
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}
