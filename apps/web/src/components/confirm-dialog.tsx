import { useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form-dialog';

/**
 * A yes/no modal for one action (deactivate, delete, publish …). It is a `FormDialog` without
 * fields, so a failed action keeps the dialog open with the API's message inline.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive={destructive}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      onSubmit={onConfirm}
    />
  );
}
