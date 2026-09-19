import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextareaField } from '@/components/form-fields';

/** A dialog that needs a written reason before it acts (resolve, mark false positive). */
export function NoteDialog({
  title,
  body,
  label,
  confirmLabel,
  onConfirm,
  open,
  onOpenChange,
}: {
  title: string;
  body: string;
  label: string;
  confirmLabel: string;
  onConfirm: (note: string) => Promise<unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () => z.object({ note: z.string().trim().min(1, t('ops.dq.reasonRequired')) }),
    [t],
  );
  const defaults = { note: '' };
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={title}
      description={body}
      submitLabel={confirmLabel}
      onSubmit={(v) => onConfirm(v.note.trim())}
    >
      <TextareaField
        control={form.control}
        name="note"
        label={label}
        rows={3}
        autoFocus
        data-testid="dq-note"
      />
    </FormDialog>
  );
}
