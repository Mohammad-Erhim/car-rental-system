import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { useUpdateLegalProfile, type LegalProfile } from '@/lib/invoice-hooks';

export const ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'region',
  'postalCode',
  'countryCode',
] as const;

interface Values {
  legalName: string;
  taxId: string;
  address: Record<(typeof ADDRESS_FIELDS)[number], string>;
}

const valuesOf = (p: LegalProfile | undefined): Values => ({
  legalName: p?.legalName ?? '',
  taxId: p?.taxId ?? '',
  address: Object.fromEntries(
    ADDRESS_FIELDS.map((f) => [f, p?.registeredAddress?.[f] ?? '']),
  ) as Values['address'],
});

/**
 * Edit the legal identity invoices are issued under. Invoicing stays paused until the legal name,
 * tax ID and the first address line and city are all set, so those are required here.
 */
export function LegalSheet({
  profile,
  open,
  onOpenChange,
}: {
  profile: LegalProfile | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateLegalProfile();
  const required = t('error.field.required');

  const schema = useMemo(
    () =>
      z.object({
        legalName: z.string().trim().min(1, required),
        taxId: z.string().trim().min(1, required),
        address: z.object({
          line1: z.string().trim().min(1, required),
          line2: z.string(),
          city: z.string().trim().min(1, required),
          region: z.string(),
          postalCode: z.string(),
          countryCode: z.string(),
        }),
      }),
    [required],
  );
  const defaults = valuesOf(profile);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.org.editTitle')}
      description={t('ops.org.legalSectionHint')}
      submitLabel={t('action.save')}
      onSubmit={async (v) => {
        const registeredAddress = Object.fromEntries(
          Object.entries(v.address).map(([k, val]) => [k, val.trim()]),
        );
        await update.mutateAsync({
          legalName: v.legalName.trim(),
          taxId: v.taxId.trim(),
          registeredAddress,
          ifMatch: profile?.version,
        });
        toast.success(t('ops.org.saved'));
      }}
    >
      <FormSection title={t('ops.org.legalSection')}>
        <TextField
          control={form.control}
          name="legalName"
          label={t('ops.org.legalName')}
          autoFocus
          data-testid="org-legal-name"
        />
        <TextField
          control={form.control}
          name="taxId"
          label={t('ops.org.taxId')}
          data-testid="org-tax-id"
        />
      </FormSection>
      <FormSection title={t('ops.org.addressSection')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {ADDRESS_FIELDS.map((f) => (
            <TextField
              key={f}
              control={form.control}
              name={`address.${f}`}
              label={t(`ops.org.address.${f}`)}
              className={f === 'line1' || f === 'line2' ? 'sm:col-span-2' : undefined}
              data-testid={`org-addr-${f}`}
            />
          ))}
        </div>
      </FormSection>
    </FormSheet>
  );
}
