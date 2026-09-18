import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextField } from '@/components/form-fields';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useUploadMedia } from '@/lib/media-hooks';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

interface Values {
  purpose: string;
  file: File | null;
}

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Add an image to the library under a purpose (what it is for). The purpose is free text in
 * lowercase, digits and underscores; the ones already in use are offered as quick picks so the
 * library doesn't fragment into near-duplicates.
 */
export function UploadDialog({
  purposes,
  defaultPurpose,
  open,
  onOpenChange,
}: {
  purposes: string[];
  defaultPurpose: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const upload = useUploadMedia();

  const schema = useMemo(
    () =>
      z.object({
        purpose: z.string().regex(/^[a-z0-9_]{2,60}$/, t('ops.cat.codeInvalid')),
        file: z
          .instanceof(File, { message: t('ops.media.fileRequired') })
          .nullable()
          .refine((f) => f !== null, {
            message: t('ops.media.fileRequired'),
          }),
      }),
    [t],
  );
  const defaults: Values = { purpose: defaultPurpose, file: null };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const purpose = form.watch('purpose');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.media.upload')}
      description={t('ops.media.uploadHint')}
      submitLabel={t('ops.media.uploadSubmit')}
      onSubmit={async (v) => {
        await upload.mutateAsync({
          purpose: v.purpose,
          dataBase64: await toDataUrl(v.file!),
          mediaType: v.file!.type,
        });
        toast.success(t('ops.media.uploaded'));
      }}
    >
      <FormField
        control={form.control}
        name="file"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.media.file')}</FormLabel>
            <FormControl>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm transition-colors hover:bg-muted/50',
                  field.value && 'border-primary bg-primary/5',
                )}
              >
                <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">
                  {field.value ? field.value.name : t('ops.media.chooseFile')}
                </span>
                <input
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  data-testid="media-file"
                  onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                />
              </label>
            </FormControl>
            <FormDescription>{t('ops.media.fileHint')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <TextField
        control={form.control}
        name="purpose"
        label={t('ops.media.purpose')}
        description={t('ops.media.purposeHint')}
        autoComplete="off"
        placeholder="vehicle_category"
        normalize={(v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')}
        data-testid="media-purpose"
      />
      {purposes.length ? (
        <div className="flex flex-wrap gap-2" aria-label={t('ops.media.existingPurposes')}>
          {purposes.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => form.setValue('purpose', p, { shouldValidate: true })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted',
                purpose === p && 'border-primary bg-primary/10 text-primary',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
    </FormDialog>
  );
}
