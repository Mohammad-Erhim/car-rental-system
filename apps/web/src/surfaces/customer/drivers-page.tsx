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
import { useState } from 'react';

import { useAddDriver, useDrivers, useRemoveDriver } from '../../lib/api-hooks.js';
import { useAuth } from '../../lib/auth.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

/**
 * SCREEN-CUS-013 — Saved drivers & documents (FR-IAM-007). Reusable driver details a customer
 * can attach to a future booking. Document upload metadata is handled at checkout; this screen
 * manages the saved set.
 */
export function DriversPage() {
  const { t } = useI18n();
  const { actor } = useAuth();
  const drivers = useDrivers(!!actor);
  const add = useAddDriver();
  const remove = useRemoveDriver();
  const errs = useFormErrors({ fullName: 'Full name', licenceNumber: 'Licence number' });

  const [fullName, setFullName] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceCountry, setLicenceCountry] = useState('');
  const [licenceExpiresOn, setLicenceExpiresOn] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Saved drivers &amp; documents</h1>
        <p className="text-sm text-muted-foreground">
          Save a driver once and reuse it at checkout. Eligibility is re-checked for each booking.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved drivers</CardTitle>
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
              title="No saved drivers yet"
              description="Add one below — it will be available the next time you book."
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
                        {d.licenceNumber ? `Licence ${d.licenceNumber}` : 'No licence on file'}
                        {d.licenceCountry ? ` · ${d.licenceCountry}` : ''}
                        {d.licenceExpiresOn ? ` · expires ${d.licenceExpiresOn}` : ''}
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
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a driver</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field
              label="Full name"
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
              <Field label="Licence number" htmlFor="field-driver-licence">
                {({ id }) => (
                  <Input
                    id={id}
                    value={licenceNumber}
                    onChange={(e) => setLicenceNumber(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Issuing country" htmlFor="field-driver-country" hint="2-letter code">
                {({ id }) => (
                  <Input
                    id={id}
                    value={licenceCountry}
                    maxLength={2}
                    onChange={(e) => setLicenceCountry(e.target.value.toUpperCase())}
                    placeholder="US"
                  />
                )}
              </Field>
            </div>
            <Field label="Licence expiry" htmlFor="field-driver-expiry" hint="YYYY-MM-DD">
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
              Save driver
            </Button>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(v) => !v && setRemoveId(null)}
        title="Remove this saved driver?"
        description="It stays on any booking it was already used for; it just won't be offered for reuse."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (removeId) remove.mutate(removeId);
        }}
      />
    </div>
  );
}
