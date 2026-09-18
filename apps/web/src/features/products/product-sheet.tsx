import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  emptyProduct,
  PRICE,
  PRODUCT_CODE,
  productValues,
  toMinor,
  validQuantity,
  type ProductValues,
} from './product-model';

import {
  CheckboxGroupField,
  CheckField,
  LookupField,
  SelectField,
  TextField,
} from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { useUpsertProduct, type CatalogueProduct } from '@/lib/admin-hooks';
import { useLocations } from '@/lib/discovery-hooks';
import { useOpsCategories } from '@/lib/ops-discovery-hooks';

const digits = (v: string) => v.replace(/\D/g, '');

/**
 * Create or edit an extra / protection product. The code is fixed once created and a taken code
 * is refused (the API would overwrite it). An empty category or location scope means "offered
 * everywhere". Bookings snapshot the price they accepted, so repricing never rewrites the past.
 */
export function ProductSheet({
  product,
  existingCodes,
  open,
  onOpenChange,
}: {
  /** set to edit; null to create */
  product: CatalogueProduct | null;
  existingCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = product !== null;
  const upsert = useUpsertProduct();
  const categories = useOpsCategories();
  const locations = useLocations();

  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .refine((v) => editing || PRODUCT_CODE.test(v), { message: t('ops.cat.codeInvalid') })
          .refine((v) => editing || !existingCodes.includes(v), { message: t('ops.cat.codeDup') }),
        name: z.string().trim().min(1, t('error.field.required')),
        kind: z.enum(['extra', 'protection']),
        price: z.string().regex(PRICE, t('ops.prod.priceInvalid')),
        currency: z.string().min(1, t('error.field.required')),
        pricingUnit: z.enum(['per_rental', 'per_day']),
        maxQuantity: z.string().refine(validQuantity, { message: t('ops.prod.maxQtyInvalid') }),
        taxable: z.boolean(),
        categoryScope: z.array(z.string()),
        locationScope: z.array(z.string()),
        sortOrder: z.string(),
      }),
    [t, editing, existingCodes],
  );

  const defaults: ProductValues = product ? productValues(product) : emptyProduct();
  const form = useForm<ProductValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={editing ? t('ops.prod.editTitle', { name: product.name }) : t('ops.prod.newTitle')}
      description={t('ops.prod.sheetHint')}
      submitLabel={editing ? t('ops.prod.saveEdit') : t('ops.prod.save')}
      onSubmit={async (v) => {
        await upsert.mutateAsync({
          code: v.code,
          name: v.name.trim(),
          kind: v.kind,
          unitPriceMinor: toMinor(v.price),
          currency: v.currency,
          pricingUnit: v.pricingUnit,
          taxable: v.taxable,
          maxQuantity: Number(v.maxQuantity),
          categoryScope: v.categoryScope,
          locationScope: v.locationScope,
          sortOrder: Number(v.sortOrder || 0),
        });
        toast.success(editing ? t('ops.prod.saved') : t('ops.prod.created'));
      }}
    >
      <FormSection title={t('ops.cat.secBasics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label={t('ops.prod.name')}
            autoFocus={!editing}
            data-testid="product-name"
          />
          {editing ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('ops.prod.code')}</p>
              <p className="bidi-isolate pt-2 font-mono text-sm text-muted-foreground">
                {product.code}
              </p>
            </div>
          ) : (
            <TextField
              control={form.control}
              name="code"
              label={t('ops.prod.code')}
              description={t('ops.prod.codeHint')}
              autoComplete="off"
              normalize={(v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')}
              data-testid="product-code"
            />
          )}
          <SelectField
            control={form.control}
            name="kind"
            label={t('ops.prod.kind')}
            options={[
              { value: 'extra', label: t('ops.prod.kindExtra') },
              { value: 'protection', label: t('ops.prod.kindProtection') },
            ]}
            testId="product-kind"
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.prod.secPricing')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="price"
            label={t('ops.prod.price')}
            description={t('ops.prod.priceHint')}
            inputMode="decimal"
            data-testid="product-price"
          />
          <LookupField
            control={form.control}
            name="currency"
            label={t('ops.prod.currency')}
            typeCode="currency"
          />
          <SelectField
            control={form.control}
            name="pricingUnit"
            label={t('ops.prod.pricingUnit')}
            description={t('ops.prod.pricingUnitHint')}
            options={[
              { value: 'per_rental', label: t('ops.prod.perRental') },
              { value: 'per_day', label: t('ops.prod.perDay') },
            ]}
            testId="product-pricing-unit"
          />
          <TextField
            control={form.control}
            name="maxQuantity"
            label={t('ops.prod.maxQty')}
            description={t('ops.prod.maxQtyHint')}
            inputMode="numeric"
            normalize={digits}
          />
        </div>
        <CheckField
          control={form.control}
          name="taxable"
          label={t('ops.prod.taxable')}
          description={t('ops.prod.taxableHint')}
        />
      </FormSection>

      <FormSection title={t('ops.prod.scope')} hint={t('ops.prod.scopeHint')}>
        <CheckboxGroupField
          control={form.control}
          name="categoryScope"
          label={t('ops.prod.categoryScope')}
          emptyLabel={t('ops.prod.allCategories')}
          options={(categories.data ?? []).map((c) => ({ value: c.code, label: c.displayName }))}
          testId="product-category-scope"
        />
        <CheckboxGroupField
          control={form.control}
          name="locationScope"
          label={t('ops.prod.locationScope')}
          emptyLabel={t('ops.prod.allLocations')}
          options={(locations.data ?? []).map((l) => ({ value: l.code, label: l.name }))}
          testId="product-location-scope"
        />
      </FormSection>

      <FormSection title={t('ops.cat.secDisplay')}>
        <TextField
          control={form.control}
          name="sortOrder"
          label={t('ops.prod.sortOrder')}
          description={t('ops.cat.sortOrderHint')}
          inputMode="numeric"
          normalize={digits}
          className="sm:max-w-[12rem]"
        />
      </FormSection>
    </FormSheet>
  );
}
