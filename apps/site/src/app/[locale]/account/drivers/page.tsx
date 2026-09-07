'use client';

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
  ErrorSummary,
  Field,
  Input,
} from '@carrental/ui';
import { IdCard } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useAuth } from '../../../../lib/auth-context';
import { useAddDriver, useDrivers, useRemoveDriver } from '../../../../lib/customer-hooks';
import { useFormErrors } from '../../../../lib/use-form-errors';

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
      <p className="text-sm text-muted-foreground">{t('driver.intro')}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('driver.savedList')}</CardTitle>
        </CardHeader>
        <CardContent>
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
            <ul className="divide-y" data-testid="driver-list">
              {drivers.data.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                  data-testid={`driver-${d.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <IdCard className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.licenceNumber
                          ? t('driver.licenceLabel', { number: d.licenceNumber })
                          : t('driver.noLicence')}
                        {d.licenceCountry ? ` · ${d.licenceCountry}` : ''}
                        {d.licenceExpiresOn
                          ? ` · ${t('driver.expires', { date: d.licenceExpiresOn })}`
                          : ''}
                      </p>
                    </div>
                    <Badge variant="neutral">{d.role.replace('_', ' ')}</Badge>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('driver.add')}</CardTitle>
        </CardHeader>
        <CardContent>
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
            <Field
              label={t('driver.licenceExpiry')}
              htmlFor="field-driver-expiry"
              hint="YYYY-MM-DD"
            >
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
        </CardContent>
      </Card>

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
