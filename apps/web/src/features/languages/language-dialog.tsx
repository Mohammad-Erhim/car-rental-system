import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextField } from '@/components/form-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUpsertLocale, type AdminLocale } from '@/lib/api-hooks';

/** Languages that are conventionally right-to-left — a mismatched direction is a footgun. */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'dv', 'yi', 'ckb', 'ug']);
export const BCP47 = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export const looksRtl = (code: string) =>
  RTL_LANGS.has(code.trim().toLowerCase().split('-')[0] ?? '');

interface Values {
  code: string;
  nativeName: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
  sortOrder: string;
}

/**
 * Add a language, or edit one's names, direction and order. The code (a BCP-47 tag) is fixed once
 * created, and the default language's direction is locked. A direction that disagrees with what
 * the language is normally written in gets a warning, not a block.
 */
export function LanguageDialog({
  locale,
  existingCodes,
  open,
  onOpenChange,
}: {
  /** set to edit; null to add */
  locale: AdminLocale | null;
  existingCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const editing = locale !== null;
  const upsert = useUpsertLocale();

  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .refine((v) => editing || BCP47.test(v.trim()), {
            message: t('ops.languages.codeInvalid'),
          })
          .refine((v) => editing || !existingCodes.includes(v.trim().toLowerCase()), {
            message: t('ops.cat.codeDup'),
          }),
        nativeName: z.string().trim().min(1, t('error.field.required')),
        englishName: z.string().trim().min(1, t('error.field.required')),
        direction: z.enum(['ltr', 'rtl']),
        sortOrder: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 999), {
          message: t('ops.languages.orderInvalid'),
        }),
      }),
    [t, editing, existingCodes],
  );
  const defaults: Values = {
    code: locale?.code ?? '',
    nativeName: locale?.nativeName ?? '',
    englishName: locale?.englishName ?? '',
    direction: locale?.direction ?? 'ltr',
    sortOrder: locale ? String(locale.sortOrder) : '',
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [code, direction] = form.watch(['code', 'direction']);
  const mismatch = looksRtl(code) && direction === 'ltr';

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={editing ? t('ops.languages.editTitle', { code: locale.code }) : t('ops.languages.add')}
      description={t('ops.languages.addHint')}
      submitLabel={editing ? t('ops.languages.save') : t('ops.languages.addAction')}
      onSubmit={async (v) => {
        await upsert.mutateAsync({
          code: v.code.trim().toLowerCase(),
          nativeName: v.nativeName.trim(),
          englishName: v.englishName.trim(),
          direction: v.direction,
          sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
        });
        toast.success(
          editing ? t('ops.languages.saved') : t('ops.languages.added', { code: v.code }),
        );
      }}
    >
      {editing ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('ops.languages.code')}</p>
          <p className="bidi-isolate font-mono text-sm text-muted-foreground">{locale.code}</p>
        </div>
      ) : (
        <TextField
          control={form.control}
          name="code"
          label={t('ops.languages.code')}
          description={t('ops.languages.codeHint')}
          placeholder="de"
          autoFocus
          autoComplete="off"
          data-testid="lang-code"
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="nativeName"
          label={t('ops.languages.nativeName')}
          placeholder="Deutsch"
          dir="auto"
          data-testid="lang-native"
        />
        <TextField
          control={form.control}
          name="englishName"
          label={t('ops.languages.englishName')}
          placeholder="German"
          data-testid="lang-english"
        />
        <SelectField
          control={form.control}
          name="direction"
          label={t('ops.languages.direction')}
          description={locale?.isDefault ? t('ops.languages.dirLocked') : undefined}
          options={[
            { value: 'ltr', label: t('ops.languages.ltr') },
            { value: 'rtl', label: t('ops.languages.rtl') },
          ]}
          testId="lang-direction"
        />
        <TextField
          control={form.control}
          name="sortOrder"
          label={t('ops.languages.order')}
          description={t('ops.languages.orderHint')}
          inputMode="numeric"
          normalize={(v) => v.replace(/\D/g, '')}
          placeholder="99"
        />
      </div>
      {mismatch ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.languages.dirMismatch')}</AlertDescription>
        </Alert>
      ) : null}
    </FormDialog>
  );
}
