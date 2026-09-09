'use client';

import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  ConfirmDialog,
  ErrorSummary,
  Field,
  Input,
} from '@carrental/ui';
import { IdCard } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useAddDriver, useDrivers, useRemoveDriver } from '../../../../lib/customer-hooks';

/** SCREEN-CUS-013 — saved drivers & documents (FR-IAM-007). */
export default function DriversPage() {
  const { t } = useI18n();
  const { actor } = useAuth();
  const drivers = useDrivers(!!actor);
  const add = useAddDriver();
  const remove = useRemoveDriver();
  const errs = useFormErrors({
    fullName: t('driver.fullName'),
    licenceNumber: t('driver.licenceNumber'),
  });

  const [fullName, setFullName] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceCountry, setLicenceCountry] = useState('');
  const [licenceExpiresOn, setLicenceExpiresOn] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    errs.clear();
    try {
      await add.mutateAsync({
        role: 'additional',
        fullName,
        licenceNumber: licenceNumber || undefined,
        licenceCountry: licenceCountry || undefined,
        licenceExpiresOn: licenceExpiresOn || undefined,
      });
      setFullName('');
      setLicenceNumber('');
      setLicenceCountry('');
      setLicenceExpiresOn('');
    } catch (err) {
      errs.fromError(err);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('driver.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('driver.intro')}</p>
      </div>

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('driver.savedList')}</h2>
        {drivers.isLoading ? (
          <AppStateView kind="loading" title={t('state.loading.title')} inline />
        ) : drivers.isError ? (
          <AppStateView
            kind="failure"
            inline
            title={t('state.failure.title')}
            primaryAction={{ label: t('action.retry'), onClick: () => drivers.refetch() }}
          />
        ) : !drivers.data?.length ? (
          <AppStateView
            kind="empty"
            inline
            title={t('driver.none')}
            description={t('driver.noneHint')}
          />
        ) : (
          <ul className="divide-y divide-hairline" data-testid="driver-list">
            {drivers.data.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                data-testid={`driver-${d.id}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-chip size-9 rounded-lg" aria-hidden="true">
                    <IdCard className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium text-ink">
                      {d.fullName}
                      <Badge variant="neutral">{d.role.replace('_', ' ')}</Badge>
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {d.licenceNumber
                        ? t('driver.licenceLabel', { number: d.licenceNumber })
                        : t('driver.noLicence')}
                      {d.licenceCountry ? ` · ${d.licenceCountry}` : ''}
                      {d.licenceExpiresOn
                        ? ` · ${t('driver.expires', { date: d.licenceExpiresOn })}`
                        : ''}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoveId(d.id)}
                  data-testid={`driver-remove-${d.id}`}
                >
                  {t('driver.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('driver.add')}</h2>
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field
            label={t('driver.fullName')}
            htmlFor="field-driver-name"
            required
            error={errs.fieldError('fullName')}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('driver.licenceNumber')} htmlFor="field-driver-licence">
              {({ id }) => (
                <Input
                  id={id}
                  value={licenceNumber}
                  onChange={(e) => setLicenceNumber(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('driver.issuingCountry')}
              htmlFor="field-driver-country"
              hint={t('driver.issuingCountryHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={licenceCountry}
                  maxLength={2}
                  onChange={(e) => setLicenceCountry(e.target.value.toUpperCase())}
                />
              )}
            </Field>
          </div>
          <Field label={t('driver.licenceExpiry')} htmlFor="field-driver-expiry" hint="YYYY-MM-DD">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={licenceExpiresOn}
                onChange={(e) => setLicenceExpiresOn(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={add.isPending} data-testid="driver-add-submit">
            {t('driver.save')}
          </Button>
        </form>
      </section>

      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(v) => !v && setRemoveId(null)}
        title={t('driver.removeConfirmTitle')}
        description={t('driver.removeConfirmBody')}
        confirmLabel={t('driver.remove')}
        destructive
        onConfirm={() => {
          if (removeId) remove.mutate(removeId);
        }}
      />
    </div>
  );
}
