import { useI18n } from '@carrental/i18n/react';
import { Check, ImageOff, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { StateView } from '@/components/state-view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaLibrary, useUploadMedia } from '@/lib/media-hooks';
import { describeMedia } from '@/lib/media-label';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export interface PickedImage {
  ref: string;
  url: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * The image field of a form: a preview with "choose" / "remove", and a dialog to pick from the
 * media library or upload a new file. It reads the library for one `purpose` itself so a form only
 * says what the image is for; the library page uses the same hooks.
 */
export function MediaPickerField({
  value,
  previewUrl,
  purpose,
  ownerType,
  ownerId,
  onChange,
  changeLabel,
  removeLabel,
  title,
  disabled,
  testId,
}: {
  value: string | null;
  previewUrl: string | null;
  /** which library slice to browse and tag uploads with, e.g. `vehicle_category` */
  purpose: string;
  ownerType?: string;
  /** what the upload belongs to, when known (a category code, a plate) */
  ownerId?: string;
  onChange: (image: PickedImage | null) => void;
  changeLabel: string;
  removeLabel: string;
  /** dialog title */
  title: string;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const library = useMediaLibrary({ purpose }, open);
  const upload = useUploadMedia();
  const items = library.data ?? [];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const item = await upload.mutateAsync({
        dataBase64: await fileToDataUrl(file),
        mediaType: file.type,
        purpose,
        ownerType,
        ownerId: ownerId || undefined,
      });
      onChange({ ref: item.ref, url: item.url });
      setOpen(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('ops.media.uploadFail'));
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border p-3" data-testid={testId}>
      <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        {previewUrl ? (
          <img src={previewUrl} alt={t('ops.media.selected')} className="size-full object-cover" />
        ) : (
          <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-testid={testId ? `${testId}-open` : undefined}
        >
          {changeLabel}
        </Button>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {removeLabel}
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={(v) => (upload.isPending ? undefined : setOpen(v))}>
        <DialogContent closeLabel={t('action.close')} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t('ops.media.pickerHint')}</DialogDescription>
          </DialogHeader>

          {library.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
              ))}
            </div>
          ) : library.isError ? (
            <StateView
              kind="error"
              title={t('ops.media.loadFail')}
              actionLabel={t('ops.st.retry')}
              onAction={() => void library.refetch()}
            />
          ) : items.length ? (
            <ul className="grid max-h-[50dvh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
              {items.map((item, i) => {
                const selected = item.ref === value;
                return (
                  <li key={item.ref}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        onChange({ ref: item.ref, url: item.url });
                        setOpen(false);
                      }}
                      className={cn(
                        'relative block aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted transition',
                        'hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected && 'ring-2 ring-primary',
                      )}
                    >
                      <img
                        src={item.url}
                        alt={describeMedia(item, i)}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                      {selected ? (
                        <span className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="size-3.5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <StateView icon={ImageOff} title={t('ops.media.empty')} className="py-8" />
          )}

          {uploadError ? (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          ) : null}

          <div className="flex justify-end border-t pt-4">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              onChange={onFile}
              data-testid={testId ? `${testId}-file` : undefined}
            />
            <Button
              type="button"
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              {upload.isPending ? t('ops.media.uploading') : t('ops.media.upload')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
