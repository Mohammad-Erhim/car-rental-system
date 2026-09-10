import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
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
import { useRef, useState } from 'react';

import { LookupSelect } from '../../components/lookup-select.js';
import {
  useCatalogueProducts,
  useSetProductActive,
  useUpsertProduct,
  type CatalogueProduct,
  type ProductPricingUnit,
} from '../../lib/admin-hooks.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import { useOpsCategories } from '../../lib/ops-discovery-hooks.js';

/**
 * SCREEN-OPS-027 / FR-ADM-006 — extras & protection products. The server owns the price; a
 * booking snapshots the accepted code/label/price into the reservation, so repricing here never
 * rewrites a past agreement. An empty category/location scope means "applies everywhere".
 */
interface FormState {
  code: string;
  name: string;
  kind: 'extra' | 'protection';
  price: string;
  currency: string;
  pricingUnit: ProductPricingUnit;
  maxQuantity: string;
  taxable: boolean;
  categoryScope: string[];
  locationScope: string[];
  sortOrder: string;
}

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  kind: 'extra',
  price: '',
  currency: 'USD',
  pricingUnit: 'per_rental',
  maxQuantity: '1',
  taxable: true,
  categoryScope: [],
  locationScope: [],
  sortOrder: '0',
});

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function ProductsPage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');

  const products = useCatalogueProducts();
  const cats = useOpsCategories();
  const locs = useLocations();
  const upsert = useUpsertProduct();
  const setActive = useSetProductActive();
  const errs = useFormErrors({
    code: t('ops.prod.code'),
    name: t('ops.prod.name'),
    unitPriceMinor: t('ops.prod.price'),
    maxQuantity: t('ops.prod.maxQty'),
    currency: t('ops.prod.currency'),
  });
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<CatalogueProduct | null>(null);
  const formCard = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });
  const kindLabel = (k: string) =>
    k === 'protection' ? t('ops.prod.kindProtection') : t('ops.prod.kindExtra');
  const unitLabel = (u: string) =>
    u === 'per_day' ? t('ops.prod.perDay') : t('ops.prod.perRental');

  function editRow(p: CatalogueProduct) {
    setForm({
      code: p.code,
      name: p.name,
      kind: p.kind,
      price: (p.unitPriceMinor / 100).toFixed(2),
      currency: p.currency,
      pricingUnit: p.pricingUnit,
      maxQuantity: String(p.maxQuantity),
      taxable: p.taxable,
      categoryScope: [...p.categoryScope],
      locationScope: [...p.locationScope],
      sortOrder: String(p.sortOrder),
    });
    setEditing(p.code);
    errs.clear();
    requestAnimationFrame(() =>
      formCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function clearForm() {
    setForm(emptyForm());
    setEditing(null);
    errs.clear();
  }

  function validate(): boolean {
    const local: Array<{ path: string; code: string }> = [];
    if (!form.code.trim()) local.push({ path: 'code', code: 'required' });
    else if (!/^[a-z0-9_]{2,60}$/.test(form.code.trim()))
      local.push({ path: 'code', code: 'invalid' });
    if (!form.name.trim()) local.push({ path: 'name', code: 'required' });
    const price = num(form.price);
    if (!Number.isFinite(price) || price < 0)
      local.push({ path: 'unitPriceMinor', code: 'must_be_positive' });
    const mq = num(form.maxQuantity);
    if (!Number.isFinite(mq) || mq < 1 || mq > 20)
      local.push({ path: 'maxQuantity', code: 'out_of_range' });
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
    try {
      await upsert.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        unitPriceMinor: Math.round(num(form.price) * 100),
        currency: form.currency || undefined,
        pricingUnit: form.pricingUnit,
        taxable: form.taxable,
        maxQuantity: Math.round(num(form.maxQuantity)),
        categoryScope: form.categoryScope,
        locationScope: form.locationScope,
        sortOrder: Math.round(num(form.sortOrder) || 0),
      });
      toast({
        title: editing ? t('ops.prod.saved') : t('ops.prod.created'),
        variant: 'success',
      });
      clearForm();
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function toggle(p: CatalogueProduct) {
    try {
      await setActive.mutateAsync({ code: p.code, active: !p.active });
      toast({
        title: p.active ? t('ops.prod.deactivated') : t('ops.prod.restored'),
        variant: 'success',
      });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t('ops.prod.toggleFail') });
      throw err; // keep the confirm dialog open on failure
    }
  }

  const columns: Array<DataTableColumn<CatalogueProduct>> = [
    { key: 'name', header: t('ops.prod.name'), cell: (p) => p.name },
    {
      key: 'code',
      header: t('ops.prod.code'),
      cell: (p) => p.code,
      className: 'font-mono text-xs',
    },
    {
      key: 'kind',
      header: t('ops.prod.kind'),
      cell: (p) => <Badge variant="neutral">{kindLabel(p.kind)}</Badge>,
    },
    {
      key: 'price',
      header: t('ops.prod.price'),
      cell: (p) => (
        <span>
          {money(p.unitPriceMinor, p.currency)}
          <span className="block text-xs text-muted-foreground">
            {unitLabel(p.pricingUnit)}
            {p.taxable ? '' : ` · ${t('ops.prod.notTaxed')}`}
          </span>
        </span>
      ),
    },
    { key: 'max', header: t('ops.prod.maxQty'), cell: (p) => String(p.maxQuantity) },
    {
      key: 'scope',
      header: t('ops.prod.scope'),
      cell: (p) => {
        const parts = [
          p.categoryScope.length ? p.categoryScope.join(', ') : t('ops.prod.allCategories'),
          p.locationScope.length ? p.locationScope.join(', ') : t('ops.prod.allLocations'),
        ];
        return <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span>;
      },
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (p) => (
        <Badge variant={p.active ? 'success' : 'neutral'}>
          {p.active ? t('ops.prod.active') : t('ops.prod.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (p) =>
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => editRow(p)}>
              {t('ops.prod.edit')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => (p.active ? setConfirmOff(p) : toggle(p))}
              data-testid={`product-toggle-${p.code}`}
            >
              {p.active ? t('ops.prod.deactivate') : t('ops.prod.restore')}
            </Button>
          </div>
        ) : null,
    },
  ];

  const ScopeGroup = ({
    label,
    options,
    selected,
    onToggle,
    allLabel,
    testid,
  }: {
    label: string;
    options: Array<{ code: string; name: string }>;
    selected: string[];
    onToggle: (code: string) => void;
    allLabel: string;
    testid: string;
  }) => (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        {selected.length === 0 ? allLabel : t('ops.prod.scopeSome', { n: selected.length })}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid={testid}>
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={selected.includes(o.code)} onChange={() => onToggle(o.code)} />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.prod.title')} description={t('ops.prod.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.prod.card')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={products.data}
            rowKey={(p) => p.id}
            isLoading={products.isLoading}
            isError={products.isError}
            onRetry={() => products.refetch()}
            rowProps={(p) => ({ 'data-code': p.code, 'data-active': String(p.active) })}
            testid="products-table"
            bodyTestid="products-rows"
            minWidth="46rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.prod.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.prod.empty'),
            }}
          />
        </CardContent>
      </Card>

      {canManage ? (
        <Card ref={formCard}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {editing ? t('ops.prod.editingName', { name: editing }) : t('ops.prod.upsert')}
            </CardTitle>
            {editing || form.code || form.name ? (
              <Button size="sm" variant="ghost" onClick={clearForm}>
                {editing ? t('ops.prod.cancelEdit') : t('ops.prod.clear')}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field
                label={t('ops.prod.code')}
                htmlFor="prod-code"
                required
                hint={t('ops.prod.codeHint')}
                error={errs.fieldError('code')}
              >
                {({ id, invalid }) =>
                  editing ? (
                    <p className="bidi-isolate pt-2 font-mono text-sm" data-testid="product-code">
                      {form.code}
                    </p>
                  ) : (
                    <Input
                      id={id}
                      invalid={invalid}
                      value={form.code}
                      onChange={(e) =>
                        set({ code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                      }
                      data-testid="product-code"
                    />
                  )
                }
              </Field>
              <Field
                label={t('ops.prod.name')}
                htmlFor="prod-name"
                required
                error={errs.fieldError('name')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                    data-testid="product-name"
                  />
                )}
              </Field>

              <Field label={t('ops.prod.kind')} htmlFor="prod-kind">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.kind}
                    onChange={(e) => set({ kind: e.target.value as 'extra' | 'protection' })}
                    data-testid="product-kind"
                  >
                    <option value="extra">{t('ops.prod.kindExtra')}</option>
                    <option value="protection">{t('ops.prod.kindProtection')}</option>
                  </Select>
                )}
              </Field>
              <Field
                label={t('ops.prod.currency')}
                htmlFor="prod-ccy"
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
                label={t('ops.prod.price')}
                htmlFor="prod-price"
                required
                hint={t('ops.prod.priceHint')}
                error={errs.fieldError('unitPriceMinor')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set({ price: e.target.value })}
                    data-testid="product-price"
                  />
                )}
              </Field>
              <Field
                label={t('ops.prod.pricingUnit')}
                htmlFor="prod-unit"
                hint={t('ops.prod.pricingUnitHint')}
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.pricingUnit}
                    onChange={(e) => set({ pricingUnit: e.target.value as ProductPricingUnit })}
                    data-testid="product-pricing-unit"
                  >
                    <option value="per_rental">{t('ops.prod.perRental')}</option>
                    <option value="per_day">{t('ops.prod.perDay')}</option>
                  </Select>
                )}
              </Field>

              <Field
                label={t('ops.prod.maxQty')}
                htmlFor="prod-maxqty"
                hint={t('ops.prod.maxQtyHint')}
                error={errs.fieldError('maxQuantity')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="numeric"
                    value={form.maxQuantity}
                    onChange={(e) => set({ maxQuantity: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('ops.prod.sortOrder')} htmlFor="prod-sort">
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(e) => set({ sortOrder: e.target.value })}
                  />
                )}
              </Field>

              <ScopeGroup
                label={t('ops.prod.categoryScope')}
                options={(cats.data ?? []).map((c) => ({ code: c.code, name: c.displayName }))}
                selected={form.categoryScope}
                onToggle={(code) =>
                  set({
                    categoryScope: form.categoryScope.includes(code)
                      ? form.categoryScope.filter((x) => x !== code)
                      : [...form.categoryScope, code],
                  })
                }
                allLabel={t('ops.prod.allCategories')}
                testid="product-category-scope"
              />
              <ScopeGroup
                label={t('ops.prod.locationScope')}
                options={(locs.data ?? []).map((l) => ({ code: l.code, name: l.name }))}
                selected={form.locationScope}
                onToggle={(code) =>
                  set({
                    locationScope: form.locationScope.includes(code)
                      ? form.locationScope.filter((x) => x !== code)
                      : [...form.locationScope, code],
                  })
                }
                allLabel={t('ops.prod.allLocations')}
                testid="product-location-scope"
              />

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={form.taxable}
                  onChange={(e) => set({ taxable: e.target.checked })}
                />
                {t('ops.prod.taxable')}
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={upsert.isPending} data-testid="product-create">
                  {editing ? t('ops.prod.saveEdit') : t('ops.prod.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!confirmOff}
        onOpenChange={(v) => !v && setConfirmOff(null)}
        destructive
        title={t('ops.prod.deactivateTitle', { name: confirmOff?.name ?? '' })}
        description={t('ops.prod.deactivateBody')}
        confirmLabel={t('ops.prod.deactivate')}
        onConfirm={async () => {
          if (confirmOff) await toggle(confirmOff);
        }}
      />
    </div>
  );
}
