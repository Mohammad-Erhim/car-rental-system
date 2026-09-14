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
  MediaPicker,
  PageHeader,
  Select,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useRef, useState } from 'react';

import {
  useCatalogueCategories,
  useCatalogueFeatures,
  useSetCategoryActive,
  useSetFeatureActive,
  useUpsertCategory,
  useUpsertFeature,
  type CategoryView,
  type FeatureView,
} from '../../lib/admin-hooks.js';
import { useMediaLibrary, useUploadMedia } from '../../lib/media-hooks.js';

/**
 * SCREEN-OPS-013/025 — vehicle categories. Passengers/luggage/doors/transmission/features shown
 * on the public site's vehicle cards (apps/site's vehicle detail page) come straight from this
 * data — there is no other place to change them; the site never hardcodes a car's specs.
 */
interface FormState {
  code: string;
  class: string;
  displayName: string;
  description: string;
  passengers: string;
  luggage: string;
  doors: string;
  transmission: 'automatic' | 'manual';
  sortOrder: string;
  featureCodes: string[];
  imageRef: string | null;
  imageUrl: string | null;
  version: number | null;
}

interface FeatureFormState {
  code: string;
  label: string;
  group: 'comfort' | 'safety' | 'tech' | 'utility';
  sortOrder: string;
  version: number | null;
}

const emptyFeatureForm = (): FeatureFormState => ({
  code: '',
  label: '',
  group: 'comfort',
  sortOrder: '0',
  version: null,
});

const emptyForm = (): FormState => ({
  code: '',
  class: '',
  displayName: '',
  description: '',
  passengers: '5',
  luggage: '2',
  doors: '4',
  transmission: 'automatic',
  sortOrder: '0',
  featureCodes: [],
  imageRef: null,
  imageUrl: null,
  version: null,
});

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function CategoriesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');

  const categories = useCatalogueCategories();
  const features = useCatalogueFeatures();
  const upsert = useUpsertCategory();
  const setActive = useSetCategoryActive();
  const categoryMedia = useMediaLibrary({ purpose: 'vehicle_category' });
  const uploadMedia = useUploadMedia();

  const errs = useFormErrors({
    code: t('ops.cat.code'),
    displayName: t('ops.cat.displayName'),
    class: t('ops.cat.class'),
    passengers: t('ops.cat.passengers'),
    luggage: t('ops.cat.luggage'),
    doors: t('ops.cat.doors'),
  });
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<CategoryView | null>(null);
  const formCard = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const transmissionLabel = (v: string) =>
    v === 'manual' ? t('ops.cat.manual') : t('ops.cat.automatic');

  function editRow(c: CategoryView) {
    setForm({
      code: c.code,
      class: c.class,
      displayName: c.displayName,
      description: c.description ?? '',
      passengers: String(c.passengers),
      luggage: String(c.luggage),
      doors: String(c.doors),
      transmission: c.transmission,
      sortOrder: String(c.sortOrder),
      featureCodes: c.features.map((f) => f.code),
      imageRef: c.imageRef,
      imageUrl: c.imageUrl,
      version: c.version,
    });
    setEditing(c.code);
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
    else if (!/^[a-z0-9_]{2,40}$/.test(form.code.trim()))
      local.push({ path: 'code', code: 'invalid' });
    if (!form.class.trim()) local.push({ path: 'class', code: 'required' });
    if (!form.displayName.trim()) local.push({ path: 'displayName', code: 'required' });
    const passengers = num(form.passengers);
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 60)
      local.push({ path: 'passengers', code: 'out_of_range' });
    const luggage = num(form.luggage);
    if (!Number.isInteger(luggage) || luggage < 0 || luggage > 30)
      local.push({ path: 'luggage', code: 'out_of_range' });
    const doors = num(form.doors);
    if (!Number.isInteger(doors) || doors < 2 || doors > 8)
      local.push({ path: 'doors', code: 'out_of_range' });
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
        class: form.class.trim(),
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        passengers: Math.round(num(form.passengers)),
        luggage: Math.round(num(form.luggage)),
        doors: Math.round(num(form.doors)),
        transmission: form.transmission,
        sortOrder: Math.round(num(form.sortOrder) || 0),
        featureCodes: form.featureCodes,
        imageRef: form.imageRef ?? undefined,
        ifMatch: editing && form.version != null ? form.version : undefined,
      });
      toast({
        title: editing ? t('ops.cat.saved') : t('ops.cat.created'),
        variant: 'success',
      });
      clearForm();
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function toggle(c: CategoryView) {
    try {
      await setActive.mutateAsync({ code: c.code, active: !c.isActive });
      toast({
        title: c.isActive ? t('ops.cat.deactivated') : t('ops.cat.restored'),
        variant: 'success',
      });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t('ops.cat.toggleFail') });
      throw err; // keep the confirm dialog open on failure
    }
  }

  // ---- feature management (its own small CRUD, separate from picking features onto a
  // category above — deactivating a feature here doesn't remove it from a category that
  // already has it, see the checkbox picker's inactive handling) ----
  const upsertFeature = useUpsertFeature();
  const setFeatureActive = useSetFeatureActive();
  const [featureForm, setFeatureForm] = useState<FeatureFormState>(emptyFeatureForm());
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [confirmFeatureOff, setConfirmFeatureOff] = useState<FeatureView | null>(null);
  const featureErrs = useFormErrors({
    code: t('ops.cat.featureCode'),
    label: t('ops.cat.featureLabel'),
  });
  const setFeatureField = (patch: Partial<FeatureFormState>) =>
    setFeatureForm((f) => ({ ...f, ...patch }));

  function editFeatureRow(f: FeatureView) {
    setFeatureForm({
      code: f.code,
      label: f.label,
      group: f.group,
      sortOrder: String(f.sortOrder),
      version: f.version,
    });
    setEditingFeature(f.code);
    featureErrs.clear();
  }

  function clearFeatureForm() {
    setFeatureForm(emptyFeatureForm());
    setEditingFeature(null);
    featureErrs.clear();
  }

  async function submitFeature(e: React.FormEvent) {
    e.preventDefault();
    featureErrs.clear();
    const local: Array<{ path: string; code: string }> = [];
    if (!featureForm.code.trim()) local.push({ path: 'code', code: 'required' });
    else if (!/^[a-z0-9_]{2,60}$/.test(featureForm.code.trim()))
      local.push({ path: 'code', code: 'invalid' });
    if (!featureForm.label.trim()) local.push({ path: 'label', code: 'required' });
    if (local.length) {
      featureErrs.setLocal(local);
      return;
    }
    try {
      await upsertFeature.mutateAsync({
        code: featureForm.code.trim(),
        label: featureForm.label.trim(),
        group: featureForm.group,
        sortOrder: Math.round(num(featureForm.sortOrder) || 0),
        ifMatch: editingFeature && featureForm.version != null ? featureForm.version : undefined,
      });
      toast({
        title: editingFeature ? t('ops.cat.featureSaved') : t('ops.cat.featureCreated'),
        variant: 'success',
      });
      clearFeatureForm();
    } catch (err) {
      featureErrs.fromError(err);
    }
  }

  async function toggleFeature(f: FeatureView) {
    try {
      await setFeatureActive.mutateAsync({ code: f.code, active: !f.isActive });
      toast({
        title: f.isActive ? t('ops.cat.featureDeactivated') : t('ops.cat.featureRestored'),
        variant: 'success',
      });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t('ops.cat.toggleFail') });
      throw err;
    }
  }

  const columns: Array<DataTableColumn<CategoryView>> = [
    { key: 'name', header: t('ops.cat.displayName'), cell: (c) => c.displayName },
    { key: 'code', header: t('ops.cat.code'), cell: (c) => c.code, className: 'font-mono text-xs' },
    { key: 'class', header: t('ops.cat.class'), cell: (c) => c.class },
    {
      key: 'specs',
      header: t('ops.cat.specs'),
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {t('ops.cat.specsSummary', {
            passengers: c.passengers,
            luggage: c.luggage,
            doors: c.doors,
          })}
          {' · '}
          {transmissionLabel(c.transmission)}
        </span>
      ),
    },
    {
      key: 'features',
      header: t('ops.cat.features'),
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.features.length
            ? t('ops.cat.featureCount', { n: c.features.length })
            : t('ops.cat.noFeatures')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (c) => (
        <Badge variant={c.isActive ? 'success' : 'neutral'}>
          {c.isActive ? t('ops.cat.active') : t('ops.cat.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (c) =>
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => editRow(c)}>
              {t('ops.cat.edit')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => (c.isActive ? setConfirmOff(c) : toggle(c))}
              data-testid={`category-toggle-${c.code}`}
            >
              {c.isActive ? t('ops.cat.deactivate') : t('ops.cat.restore')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.cat.title')} description={t('ops.cat.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.cat.card')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={categories.data}
            rowKey={(c) => c.id}
            isLoading={categories.isLoading}
            isError={categories.isError}
            onRetry={() => categories.refetch()}
            rowProps={(c) => ({ 'data-code': c.code, 'data-active': String(c.isActive) })}
            testid="categories-table"
            bodyTestid="categories-rows"
            minWidth="50rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.cat.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.cat.empty'),
            }}
          />
        </CardContent>
      </Card>

      {canManage ? (
        <Card ref={formCard}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {editing ? t('ops.cat.editingName', { name: editing }) : t('ops.cat.upsert')}
            </CardTitle>
            {editing || form.code || form.displayName ? (
              <Button size="sm" variant="ghost" onClick={clearForm}>
                {editing ? t('ops.cat.cancelEdit') : t('ops.cat.clear')}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field
                label={t('ops.cat.code')}
                htmlFor="cat-code"
                required
                hint={t('ops.cat.codeHint')}
                error={errs.fieldError('code')}
              >
                {({ id, invalid }) =>
                  editing ? (
                    <p className="bidi-isolate pt-2 font-mono text-sm" data-testid="category-code">
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
                      data-testid="category-code"
                    />
                  )
                }
              </Field>
              <Field
                label={t('ops.cat.displayName')}
                htmlFor="cat-name"
                required
                error={errs.fieldError('displayName')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={form.displayName}
                    onChange={(e) => set({ displayName: e.target.value })}
                    data-testid="category-name"
                  />
                )}
              </Field>

              <Field
                label={t('ops.cat.class')}
                htmlFor="cat-class"
                required
                hint={t('ops.cat.classHint')}
                error={errs.fieldError('class')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={form.class}
                    onChange={(e) => set({ class: e.target.value })}
                    data-testid="category-class"
                  />
                )}
              </Field>
              <Field label={t('ops.cat.transmission')} htmlFor="cat-transmission">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.transmission}
                    onChange={(e) =>
                      set({ transmission: e.target.value as 'automatic' | 'manual' })
                    }
                    data-testid="category-transmission"
                  >
                    <option value="automatic">{t('ops.cat.automatic')}</option>
                    <option value="manual">{t('ops.cat.manual')}</option>
                  </Select>
                )}
              </Field>

              <Field
                label={t('ops.cat.passengers')}
                htmlFor="cat-passengers"
                required
                error={errs.fieldError('passengers')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="numeric"
                    value={form.passengers}
                    onChange={(e) => set({ passengers: e.target.value })}
                    data-testid="category-passengers"
                  />
                )}
              </Field>
              <Field
                label={t('ops.cat.luggage')}
                htmlFor="cat-luggage"
                required
                error={errs.fieldError('luggage')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="numeric"
                    value={form.luggage}
                    onChange={(e) => set({ luggage: e.target.value })}
                    data-testid="category-luggage"
                  />
                )}
              </Field>
              <Field
                label={t('ops.cat.doors')}
                htmlFor="cat-doors"
                required
                error={errs.fieldError('doors')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="numeric"
                    value={form.doors}
                    onChange={(e) => set({ doors: e.target.value })}
                    data-testid="category-doors"
                  />
                )}
              </Field>
              <Field label={t('ops.cat.sortOrder')} htmlFor="cat-sort">
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(e) => set({ sortOrder: e.target.value })}
                  />
                )}
              </Field>

              <Field
                label={t('ops.cat.description')}
                htmlFor="cat-description"
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={form.description}
                    onChange={(e) => set({ description: e.target.value })}
                    data-testid="category-description"
                  />
                )}
              </Field>

              <Field label={t('ops.cat.image')} htmlFor="cat-image" className="sm:col-span-2">
                {() => (
                  <MediaPicker
                    value={form.imageRef}
                    previewUrl={form.imageUrl}
                    items={categoryMedia.data ?? []}
                    isLoading={categoryMedia.isLoading}
                    isError={categoryMedia.isError}
                    onUpload={(input) =>
                      uploadMedia.mutateAsync({
                        ...input,
                        purpose: 'vehicle_category',
                        ownerType: 'vehicle_category',
                        ownerId: form.code || undefined,
                      })
                    }
                    onSelect={(item) =>
                      set({ imageRef: item?.ref ?? null, imageUrl: item?.url ?? null })
                    }
                    labels={{
                      change: t('ops.cat.imageChange'),
                      remove: t('ops.cat.imageRemove'),
                      title: t('ops.cat.imagePickerTitle'),
                    }}
                    data-testid="category-image"
                  />
                )}
              </Field>

              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium">{t('ops.cat.features')}</legend>
                <p className="mb-2 text-xs text-muted-foreground">
                  {form.featureCodes.length
                    ? t('ops.cat.featureCount', { n: form.featureCodes.length })
                    : t('ops.cat.noFeatures')}
                  {' — '}
                  {t('ops.cat.manageFeaturesHint')}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="category-features">
                  {(features.data ?? []).map((f) => {
                    const checked = form.featureCodes.includes(f.code);
                    const selectable = f.isActive || checked;
                    return (
                      <label
                        key={f.code}
                        className={`flex items-center gap-1.5 text-sm ${selectable ? '' : 'opacity-50'}`}
                        title={f.isActive ? undefined : t('ops.cat.featureInactiveHint')}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!selectable}
                          onChange={() =>
                            set({
                              featureCodes: checked
                                ? form.featureCodes.filter((x) => x !== f.code)
                                : [...form.featureCodes, f.code],
                            })
                          }
                        />
                        {f.label}
                        {f.isActive ? null : ` (${t('ops.cat.inactive').toLowerCase()})`}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={upsert.isPending} data-testid="category-save">
                  {editing ? t('ops.cat.saveEdit') : t('ops.cat.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.cat.featuresCard')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('ops.cat.featuresCardHint')}</p>
          <ul className="divide-y divide-hairline" data-testid="features-list">
            {(features.data ?? []).map((f) => (
              <li
                key={f.code}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                data-code={f.code}
                data-active={String(f.isActive)}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{f.code}</span>
                  <Badge variant="neutral">{t(`ops.cat.group.${f.group}`)}</Badge>
                  <Badge variant={f.isActive ? 'success' : 'neutral'}>
                    {f.isActive ? t('ops.cat.active') : t('ops.cat.inactive')}
                  </Badge>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => editFeatureRow(f)}>
                      {t('ops.cat.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (f.isActive ? setConfirmFeatureOff(f) : toggleFeature(f))}
                      data-testid={`feature-toggle-${f.code}`}
                    >
                      {f.isActive ? t('ops.cat.deactivate') : t('ops.cat.restore')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
            {!features.data?.length ? (
              <li className="py-2 text-sm text-muted-foreground">{t('ops.cat.noFeaturesYet')}</li>
            ) : null}
          </ul>

          {canManage ? (
            <form
              onSubmit={submitFeature}
              className="grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2"
              noValidate
            >
              <ErrorSummary title={t('ops.cfg.checkFields')} errors={featureErrs.summary} />
              <Field
                label={t('ops.cat.featureCode')}
                htmlFor="feature-code"
                required
                hint={t('ops.cat.codeHint')}
                error={featureErrs.fieldError('code')}
              >
                {({ id, invalid }) =>
                  editingFeature ? (
                    <p className="bidi-isolate pt-2 font-mono text-sm" data-testid="feature-code">
                      {featureForm.code}
                    </p>
                  ) : (
                    <Input
                      id={id}
                      invalid={invalid}
                      value={featureForm.code}
                      onChange={(e) =>
                        setFeatureField({
                          code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                        })
                      }
                      data-testid="feature-code"
                    />
                  )
                }
              </Field>
              <Field
                label={t('ops.cat.featureLabel')}
                htmlFor="feature-label"
                required
                error={featureErrs.fieldError('label')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={featureForm.label}
                    onChange={(e) => setFeatureField({ label: e.target.value })}
                    data-testid="feature-label"
                  />
                )}
              </Field>
              <Field label={t('ops.cat.group')} htmlFor="feature-group">
                {({ id }) => (
                  <Select
                    id={id}
                    value={featureForm.group}
                    onChange={(e) =>
                      setFeatureField({
                        group: e.target.value as FeatureFormState['group'],
                      })
                    }
                    data-testid="feature-group"
                  >
                    <option value="comfort">{t('ops.cat.group.comfort')}</option>
                    <option value="safety">{t('ops.cat.group.safety')}</option>
                    <option value="tech">{t('ops.cat.group.tech')}</option>
                    <option value="utility">{t('ops.cat.group.utility')}</option>
                  </Select>
                )}
              </Field>
              <Field label={t('ops.cat.sortOrder')} htmlFor="feature-sort">
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={featureForm.sortOrder}
                    onChange={(e) => setFeatureField({ sortOrder: e.target.value })}
                  />
                )}
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={upsertFeature.isPending} data-testid="feature-save">
                  {editingFeature ? t('ops.cat.saveEdit') : t('ops.cat.featureAdd')}
                </Button>
                {editingFeature ? (
                  <Button type="button" variant="ghost" onClick={clearFeatureForm}>
                    {t('ops.cat.cancelEdit')}
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmOff}
        onOpenChange={(v) => !v && setConfirmOff(null)}
        destructive
        title={t('ops.cat.deactivateTitle', { name: confirmOff?.displayName ?? '' })}
        description={t('ops.cat.deactivateBody')}
        confirmLabel={t('ops.cat.deactivate')}
        onConfirm={async () => {
          if (confirmOff) await toggle(confirmOff);
        }}
      />

      <ConfirmDialog
        open={!!confirmFeatureOff}
        onOpenChange={(v) => !v && setConfirmFeatureOff(null)}
        destructive
        title={t('ops.cat.featureDeactivateTitle', { name: confirmFeatureOff?.label ?? '' })}
        description={t('ops.cat.featureDeactivateBody')}
        confirmLabel={t('ops.cat.deactivate')}
        onConfirm={async () => {
          if (confirmFeatureOff) await toggleFeature(confirmFeatureOff);
        }}
      />
    </div>
  );
}
