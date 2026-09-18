import type { TranslationEntry } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextareaField } from '@/components/form-fields';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api';
import { useUpsertTranslation } from '@/lib/api-hooks';

interface Values {
  value: string;
  status: 'draft' | 'in_review';
}

/**
 * Translate one string. The English source and what is live now sit above the field so the
 * translator sees what they are replacing; "draft" keeps it private, "in review" queues it for
 * the next publish. If someone else changed the key meanwhile, the save is refused and the list
 * is reloaded (`onConflict`).
 */
export function TranslateDialog({
  entry,
  namespace,
  locale,
  onConflict,
  open,
  onOpenChange,
}: {
  entry: TranslationEntry;
  namespace: string;
  locale: string;
  onConflict: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const upsert = useUpsertTranslation();

  const schema = useMemo(
    () =>
      z.object({
        value: z.string().trim().min(1, t('error.field.required')).max(4000),
        status: z.enum(['draft', 'in_review']),
      }),
    [t],
  );
  const defaults: Values = {
    value: entry.translation ?? '',
    status: entry.status === 'draft' ? 'draft' : 'in_review',
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const liveDiffers = entry.published != null && entry.published !== entry.translation;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={t('ops.trans.translateTitle', { locale })}
      description={<span className="bidi-isolate font-mono text-xs">{entry.key}</span>}
      submitLabel={t('ops.trans.save')}
      onSubmit={async (v) => {
        try {
          await upsert.mutateAsync({
            namespace,
            key: entry.key,
            localeCode: locale,
            value: v.value.trim(),
            status: v.status,
            expectedVersion: entry.version,
          });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'state_conflict') onConflict();
          throw err;
        }
        toast.success(t(v.status === 'draft' ? 'ops.trans.saved' : 'ops.trans.reviewed'));
      }}
    >
      <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('ops.trans.source')}
          </p>
          <span className="flex items-center gap-1.5">
            {entry.outdated ? <Badge variant="warning">{t('ops.trans.outdated')}</Badge> : null}
            <Badge variant="secondary">{t(`ops.trans.state.${entry.status}`)}</Badge>
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm">{entry.source}</p>
      </div>
      {liveDiffers ? (
        <p className="text-xs text-muted-foreground">
          {t('ops.trans.liveNow', { value: entry.published })}
        </p>
      ) : null}
      {entry.reviewedAt ? (
        <p className="text-xs text-muted-foreground">
          {t('ops.trans.reviewedAt', { date: fmt.dateTime(entry.reviewedAt) })}
        </p>
      ) : null}
      <TextareaField
        control={form.control}
        name="value"
        label={t('ops.trans.translation')}
        rows={5}
        autoFocus
        data-testid="translation-value"
      />
      <SelectField
        control={form.control}
        name="status"
        label={t('ops.trans.saveAs')}
        description={t('ops.trans.saveAsHint')}
        options={[
          { value: 'in_review', label: t('ops.trans.state.in_review') },
          { value: 'draft', label: t('ops.trans.state.draft') },
        ]}
        testId="translation-status"
      />
    </FormDialog>
  );
}
