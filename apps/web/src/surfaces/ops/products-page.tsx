import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import {
  useCatalogueProducts,
  useSetProductActive,
  useUpsertProduct,
  type CatalogueProduct,
} from '../../lib/admin-hooks.js';
import { useAuth } from '../../lib/auth.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

/**
 * SCREEN-OPS-027 / FR-ADM-006 — extras & protection products. The server owns the price; a
 * booking snapshots the accepted code/label/price into the reservation, so repricing here never
 * rewrites a past agreement. An empty category/location scope means "applies everywhere".
 */
const parseScope = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const emptyForm = {
  code: '',
  name: '',
  kind: 'extra' as 'extra' | 'protection',
  price: '',
  maxQuantity: '1',
  taxable: true,
  categoryScope: '',
  locationScope: '',
  sortOrder: '0',
};

export function ProductsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');

  const products = useCatalogueProducts();
  const upsert = useUpsertProduct();
  const setActive = useSetProductActive();
  const errs = useFormErrors({
    code: t('ops.prod.code'),
    name: t('ops.prod.name'),
    unitPriceMinor: t('ops.prod.price'),
  });
  const [form, setForm] = useState(emptyForm);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const money = (m: number, c: string) => `${(m / 100).toFixed(2)} ${c}`;

  function editRow(p: CatalogueProduct) {
    setForm({
      code: p.code,
      name: p.name,
      kind: p.kind,
      price: (p.unitPriceMinor / 100).toString(),
      maxQuantity: p.maxQuantity.toString(),
      taxable: p.taxable,
      categoryScope: p.categoryScope.join(', '),
      locationScope: p.locationScope.join(', '),
      sortOrder: p.sortOrder.toString(),
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    try {
      await upsert.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        unitPriceMinor: Math.round(Number(form.price) * 100),
        taxable: form.taxable,
        maxQuantity: Math.max(1, Math.round(Number(form.maxQuantity) || 1)),
        categoryScope: parseScope(form.categoryScope),
        locationScope: parseScope(form.locationScope),
        sortOrder: Math.round(Number(form.sortOrder) || 0),
      });
      setForm(emptyForm);
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function toggle(p: CatalogueProduct) {
    setToggleError(null);
    try {
      await setActive.mutateAsync({ code: p.code, active: !p.active });
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : t('ops.prod.toggleFail'));
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
      cell: (p) => (
        <Badge variant="neutral">
          {p.kind === 'protection' ? t('ops.prod.kindProtection') : t('ops.prod.kindExtra')}
        </Badge>
      ),
    },
    { key: 'price', header: t('ops.prod.price'), cell: (p) => money(p.unitPriceMinor, p.currency) },
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
              onClick={() => toggle(p)}
              data-testid={`product-toggle-${p.code}`}
            >
              {p.active ? t('ops.prod.deactivate') : t('ops.prod.restore')}
            </Button>
          </div>
        ) : null,
    },
  ];

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
            minWidth="44rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.prod.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.prod.empty'),
            }}
          />
          {toggleError ? (
            <p className="mt-2 text-sm text-destructive" data-testid="product-toggle-error">
              {toggleError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ops.prod.upsert')}</CardTitle>
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
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    data-testid="product-code"
                    required
                  />
                )}
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
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    data-testid="product-name"
                    required
                  />
                )}
              </Field>
              <Field label={t('ops.prod.kind')} htmlFor="prod-kind">
                {({ id }) => (
                  <select
                    id={id}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={form.kind}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kind: e.target.value as 'extra' | 'protection' }))
                    }
                    data-testid="product-kind"
                  >
                    <option value="extra">{t('ops.prod.kindExtra')}</option>
                    <option value="protection">{t('ops.prod.kindProtection')}</option>
                  </select>
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
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    data-testid="product-price"
                    required
                  />
                )}
              </Field>
              <Field
                label={t('ops.prod.maxQty')}
                htmlFor="prod-maxqty"
                hint={t('ops.prod.maxQtyHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={form.maxQuantity}
                    onChange={(e) => setForm((f) => ({ ...f, maxQuantity: e.target.value }))}
                  />
                )}
              </Field>
              <Field label={t('ops.prod.sortOrder')} htmlFor="prod-sort">
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  />
                )}
              </Field>
              <Field
                label={t('ops.prod.categoryScope')}
                htmlFor="prod-catscope"
                hint={t('ops.prod.scopeHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.categoryScope}
                    onChange={(e) => setForm((f) => ({ ...f, categoryScope: e.target.value }))}
                    placeholder={t('ops.prod.allCategories')}
                  />
                )}
              </Field>
              <Field
                label={t('ops.prod.locationScope')}
                htmlFor="prod-locscope"
                hint={t('ops.prod.scopeHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.locationScope}
                    onChange={(e) => setForm((f) => ({ ...f, locationScope: e.target.value }))}
                    placeholder={t('ops.prod.allLocations')}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.taxable}
                  onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))}
                />
                {t('ops.prod.taxable')}
              </label>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" loading={upsert.isPending} data-testid="product-create">
                  {t('ops.prod.save')}
                </Button>
                {form.code || form.name ? (
                  <Button type="button" variant="ghost" onClick={() => setForm(emptyForm)}>
                    {t('ops.prod.clear')}
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
