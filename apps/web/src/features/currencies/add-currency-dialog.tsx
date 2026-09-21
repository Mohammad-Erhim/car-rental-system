import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { CheckField, SelectField } from '@/components/form-fields';
import { useCurrencyActions } from '@/lib/currency-hooks';

interface Values {
  code: string;
  makeDefault: boolean;
}

/**
 * Enable a currency. Only currencies from the supported list are offered — a code cannot be
 * typed, so it cannot be mistyped — each shown with its name and how many decimals it has.
 */
export function AddCurrencyDialog({
  available,
  open,
  onOpenChange,
}: {
  available: Array<{ code: string; name: string; digits: number }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const { enable } = useCurrencyActions();

  // the currency's name in the operator's own language, from the browser's ICU data
  const options = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'currency' });
    } catch {
      names = null;
    }
    return available.map((c) => ({
      value: c.code,
      label: `${c.code} — ${names?.of(c.code) ?? c.name}`,
    }));
  }, [available, locale]);

  const schema = useMemo(
    () =>
      z.object({
        code: z.string().min(1, t('error.field.required')),
        makeDefault: z.boolean(),
      }),
    [t],
  );
  const defaults: Values = { code: available[0]?.code ?? '', makeDefault: false };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.ccy.addTitle')}
      description={t('ops.ccy.addHint')}
      submitLabel={t('ops.ccy.addAction')}
      submitDisabled={available.length === 0}
      onSubmit={async (v) => {
        await enable.mutateAsync({ code: v.code, makeDefault: v.makeDefault });
        toast.success(t('ops.ccy.added', { code: v.code }));
      }}
    >
      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('ops.ccy.allAdded')}</p>
      ) : (
        <>
          <SelectField
            control={form.control}
            name="code"
            label={t('ops.ccy.currency')}
            options={options}
            testId="ccy-select"
          />
          <CheckField
            control={form.control}
            name="makeDefault"
            label={t('ops.ccy.makeDefault')}
            description={t('ops.ccy.makeDefaultHint')}
            testId="ccy-make-default"
          />
        </>
      )}
    </FormDialog>
  );
}
