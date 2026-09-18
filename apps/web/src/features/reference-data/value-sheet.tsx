import type { LookupValue } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useLookupMutations } from './use-lookup-mutations';

import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';

export interface ActiveLocale {
  code: string;
  englishName: string;
}

/**
 * Create or edit one value of a reference list. The stable code identifies the value in data and
 * can't change afterwards; the labels are what people see, one per active locale (English is
 * required, the others fall back to it when empty).
 */
export function ValueSheet({
  typeCode,
  locales,
  existingCodes,
  value,
  open,
  onOpenChange,
}: {
  typeCode: string;
  locales: ActiveLocale[];
  existingCodes: string[];
  /** set to edit; null to create */
  value: LookupValue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = value !== null;
  const { create, update } = useLookupMutations(typeCode);

  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string(),
          labels: z.record(z.string()),
          isDefault: z.boolean(),
        })
        .superRefine((v, ctx) => {
          if (!editing) {
            if (!/^[a-z0-9_]+$/.test(v.code)) {
              ctx.addIssue({ code: 'custom', path: ['code'], message: t('ops.ref.codeInvalid') });
            } else if (existingCodes.includes(v.code)) {
              ctx.addIssue({ code: 'custom', path: ['code'], message: t('ops.ref.codeDup') });
            }
          }
          if (!(v.labels.en ?? '').trim()) {
            ctx.addIssue({
              code: 'custom',
              path: ['labels', 'en'],
              message: t('error.field.required'),
            });
          }
        }),
    [t, editing, existingCodes],
  );
  type Values = z.infer<typeof schema>;

  const defaults: Values = {
    code: value?.code ?? '',
    labels: Object.fromEntries(
      locales.map((l) => [
        l.code,
        value?.translations?.[l.code] ?? (l.code === 'en' ? (value?.label ?? '') : ''),
      ]),
    ),
    isDefault: value?.isDefault ?? false,
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={editing ? t('ops.ref.editValue') : t('ops.ref.newValue')}
      description={t('ops.ref.editorHint')}
      submitLabel={t('ops.st.save')}
      onSubmit={async (v) => {
        const en = (v.labels.en ?? '').trim();
        const translations: Record<string, string> = {};
        for (const l of locales)
          if (l.code !== 'en') translations[l.code] = (v.labels[l.code] ?? '').trim();
        if (editing) {
          await update.mutateAsync({
            id: value.id,
            version: value.version,
            label: en,
            translations,
            isDefault: v.isDefault,
          });
          toast.success(t('ops.ref.valueSaved'));
        } else {
          await create.mutateAsync({
            code: v.code,
            label: en,
            translations,
            isDefault: v.isDefault,
          });
          toast.success(t('ops.ref.created', { code: v.code }));
        }
      }}
    >
      {editing ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('ops.ref.stableCode')}</p>
          <p className="bidi-isolate font-mono text-sm text-muted-foreground">{value.code}</p>
        </div>
      ) : (
        <TextField
          control={form.control}
          name="code"
          label={t('ops.ref.stableCode')}
          description={t('ops.ref.codeHint')}
          placeholder={t('ops.ref.codePlaceholder')}
          autoFocus
          autoComplete="off"
          normalize={(v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')}
          data-testid="value-code"
        />
      )}

      {locales.map((l) => (
        <TextField
          key={l.code}
          control={form.control}
          name={`labels.${l.code}`}
          label={t('ops.ref.labelForLocale', { locale: l.englishName })}
          description={l.code === 'en' ? undefined : t('ops.ref.localeFallbackHint')}
          dir="auto"
          data-testid={`label-${l.code}`}
        />
      ))}

      <FormField
        control={form.control}
        name="isDefault"
        render={({ field }) => (
          <FormItem className="flex items-start gap-3 space-y-0 rounded-lg border p-4">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                data-testid="value-default"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="cursor-pointer">{t('ops.ref.setDefault')}</FormLabel>
              <FormDescription>{t('ops.ref.setDefaultHint')}</FormDescription>
            </div>
          </FormItem>
        )}
      />
    </FormSheet>
  );
}
