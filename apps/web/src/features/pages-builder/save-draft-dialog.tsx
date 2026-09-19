import { useI18n } from '@carrental/i18n/react';
import { useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';

/** Save the edited pages as a draft revision, with an optional note for the reviewer. */
export function SaveDraftDialog({
  onSave,
  open,
  onOpenChange,
}: {
  onSave: (note: string) => Promise<unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const defaults = { note: '' };
  const form = useForm({ defaultValues: defaults });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.pages.saveDraft')}
      description={t('ops.pages.saveDraftHint')}
      submitLabel={t('ops.pages.saveDraft')}
      onSubmit={(v) => onSave(v.note.trim())}
    >
      <TextareaField
        control={form.control}
        name="note"
        label={t('ops.pages.notePlaceholder')}
        rows={3}
        autoFocus
        data-testid="pages-note"
      />
    </FormDialog>
  );
}
