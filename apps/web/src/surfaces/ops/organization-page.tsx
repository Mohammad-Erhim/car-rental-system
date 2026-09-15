import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  useToast,
} from '@carrental/ui';
import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ApiError } from '../../lib/api.js';
import { useLegalProfile, useUpdateLegalProfile } from '../../lib/invoice-hooks.js';

const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'region', 'postalCode', 'countryCode'] as const;

/**
 * SCREEN-OPS-042 — the organization's legal identity for invoicing (FR-PAY). `InvoiceService`
 * refuses to issue an invoice while `legalName`/`taxId`/`registeredAddress` are unset, so an
 * admin filling this in for the first time is what turns formal invoicing on — nothing else does.
 */
export function OrganizationPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const profile = useLegalProfile();
  const update = useUpdateLegalProfile();

  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setLegalName(profile.data.legalName ?? '');
    setTaxId(profile.data.taxId ?? '');
    setAddress(profile.data.registeredAddress ?? {});
  }, [profile.data]);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        legalName: legalName.trim(),
        taxId: taxId.trim(),
        registeredAddress: address,
        ifMatch: profile.data?.version,
      });
      toast({ title: t('ops.org.saved'), variant: 'success' });
    } catch (e) {
      setErr(errText(e, t('ops.org.saveFail')));
    }
  }

  if (profile.isLoading) {
    return <AppStateView kind="loading" title={t('state.loading.title')} />;
  }
  if (profile.isError) {
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        description={errText(profile.error, t('ops.org.loadFail'))}
        primaryAction={{ label: t('action.retry'), onClick: () => profile.refetch() }}
      />
    );
  }

  const complete = !!(legalName.trim() && taxId.trim() && address.line1 && address.city);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.org.title')} description={t('ops.org.subtitle')} />

      {!complete ? (
        <p
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
          data-testid="org-incomplete-banner"
        >
          {t('ops.org.incompleteBanner')}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 className="size-3.5" aria-hidden="true" />
            </span>
            {t('ops.org.legalSection')}
          </CardTitle>
          <CardDescription>{t('ops.org.legalSectionHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* a config.read-only viewer reaches this screen too — disable every write control
              instead of letting them edit fields that appear on every future customer invoice. */}
          <fieldset disabled={!canPublish} className="contents">
            <Field label={t('ops.org.legalName')} htmlFor="org-legal-name" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  data-testid="org-legal-name"
                />
              )}
            </Field>
            <Field label={t('ops.org.taxId')} htmlFor="org-tax-id" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  data-testid="org-tax-id"
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {ADDRESS_FIELDS.map((field) => (
                <Field
                  key={field}
                  label={t(`ops.org.address.${field}`)}
                  htmlFor={`org-addr-${field}`}
                  required={field === 'line1' || field === 'city'}
                >
                  {({ id }) => (
                    <Input
                      id={id}
                      value={address[field] ?? ''}
                      onChange={(e) => setAddress((a) => ({ ...a, [field]: e.target.value }))}
                      data-testid={`org-addr-${field}`}
                    />
                  )}
                </Field>
              ))}
            </div>
            <Button onClick={save} loading={update.isPending} data-testid="org-save">
              {t('action.save')}
            </Button>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  );
}
