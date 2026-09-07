import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useState } from 'react';

import { ApiError } from '../../lib/api.js';
import {
  useCreateRatePlan,
  useOpsCategories,
  usePublishRatePlan,
  useRatePlans,
} from '../../lib/ops-discovery-hooks.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

/**
 * SCREEN-OPS-025/026 — Rate plans. Draft → publish; a published plan is immutable (create a new
 * one to change a price). Publishing a plan retires the previous published plan for the same
 * scope and takes effect on the customer search with no redeploy.
 */
export function RatePlansPage() {
  const { t } = useI18n();
  const plans = useRatePlans();
  const cats = useOpsCategories();
  const create = useCreateRatePlan();
  const publish = usePublishRatePlan();
  const errs = useFormErrors({ baseDayMinor: t('ops.rp.baseDay'), name: t('ops.tbl.name') });
  const [publishError, setPublishError] = useState<string | null>(null);

  const [form, setForm] = useState({
    categoryCode: '',
    name: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    baseDay: '',
    hour: '',
    taxPct: '20',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    try {
      await create.mutateAsync({
        categoryCode: form.categoryCode || cats.data?.[0]?.code || 'economy',
        name: form.name,
        effectiveFrom: form.effectiveFrom,
        baseDayMinor: Math.round(Number(form.baseDay) * 100),
        hourMinor: form.hour ? Math.round(Number(form.hour) * 100) : 0,
        minDurationHours: 24,
        taxBps: Math.round(Number(form.taxPct) * 100),
        fees: [],
      });
      setForm((f) => ({ ...f, name: '', baseDay: '', hour: '' }));
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function doPublish(id: string) {
    setPublishError(null);
    try {
      await publish.mutateAsync(id);
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : t('ops.rp.publishFail'));
    }
  }

  const money = (m: number, c: string) => `${(m / 100).toFixed(2)} ${c}`;

  const TH = ['name', 'category', 'baseDay', 'tax', 'status'] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.rp.title')} description={t('ops.rp.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.rp.card')}</CardTitle>
        </CardHeader>
        <CardContent>
          {plans.isLoading ? (
            <AppStateView kind="loading" inline title={t('ops.st.loading')} />
          ) : plans.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.rp.loadFail')}
              primaryAction={{ label: t('ops.st.retry'), onClick: () => plans.refetch() }}
            />
          ) : !plans.data?.length ? (
            <AppStateView kind="empty" inline title={t('ops.rp.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm" data-testid="rate-plan-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    {TH.map((k) => (
                      <th key={k} className="py-1 text-start font-medium">
                        {t(`ops.tbl.${k}`)}
                      </th>
                    ))}
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody data-testid="rate-plan-rows">
                  {plans.data.map((p) => (
                    <tr key={p.id} className="border-t" data-plan={p.name} data-status={p.status}>
                      <td className="py-2 pe-2">{p.name}</td>
                      <td className="py-2 pe-2 font-mono text-xs">{p.categoryCode}</td>
                      <td className="py-2 pe-2">{money(p.baseDayMinor, p.currency)}</td>
                      <td className="py-2 pe-2">{(p.taxBps / 100).toFixed(0)}%</td>
                      <td className="py-2 pe-2">
                        <Badge variant={p.status === 'published' ? 'success' : 'neutral'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-end">
                        {p.status !== 'published' && p.status !== 'retired' ? (
                          <Button
                            size="sm"
                            onClick={() => doPublish(p.id)}
                            data-testid={`publish-${p.name.replace(/\s+/g, '-')}`}
                          >
                            {t('ops.rp.publish')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {publishError ? (
            <p className="mt-2 text-sm text-destructive" data-testid="rate-plan-publish-error">
              {publishError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.rp.newDraft')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label={t('ops.rp.category')} htmlFor="rp-category">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.categoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
                >
                  <option value="">{t('ops.rp.firstAvail')}</option>
                  {(cats.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.displayName} ({c.code})
                    </option>
                  ))}
                </select>
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
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
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
                  onChange={(e) => setForm((f) => ({ ...f, baseDay: e.target.value }))}
                  required
                />
              )}
            </Field>
            <Field label={t('ops.rp.extraHour')} htmlFor="rp-hour" hint={t('ops.rp.extraHourHint')}>
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={form.hour}
                  onChange={(e) => setForm((f) => ({ ...f, hour: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('ops.rp.taxPct')} htmlFor="rp-tax">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={form.taxPct}
                  onChange={(e) => setForm((f) => ({ ...f, taxPct: e.target.value }))}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={create.isPending} data-testid="rate-plan-create">
                {t('ops.rp.createDraft')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
