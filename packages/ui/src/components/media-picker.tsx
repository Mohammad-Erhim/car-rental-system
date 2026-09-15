import { ImageOff, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '../lib/utils.js';

import { Button } from './button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog.js';
import { Spinner } from './spinner.js';

export interface MediaPickerItem {
  ref: string;
  url: string;
  purpose: string;
  mediaType: string;
}

export interface MediaPickerLabels {
  change: string;
  remove: string;
  title: string;
  upload: string;
  uploading: string;
  empty: string;
  loadFail: string;
}

const DEFAULT_LABELS: MediaPickerLabels = {
  change: 'Choose image',
  remove: 'Remove image',
  title: 'Choose an image',
  upload: 'Upload new',
  uploading: 'Uploading…',
  empty: 'No images yet — upload one below.',
  loadFail: "Couldn't load the media library",
};

/**
 * Best-effort accessible label for one library thumbnail. `MediaPickerItem` carries no
 * caption/filename (the media model doesn't have one — checked `apps/web/src/lib/media-hooks.ts`
 * and the API's media schema), so this falls back to the two fields that actually exist —
 * `purpose` (e.g. `vehicle_unit`) and `mediaType` — plus a 1-based position so items sharing a
 * purpose are still distinguishable to a screen-reader user. Callers with richer per-item data
 * can override via the `describeItem` prop.
 */
function defaultDescribeItem(item: MediaPickerItem, index: number): string {
  const purpose = item.purpose.replace(/[_-]+/g, ' ').trim();
  const kind = item.mediaType.split('/')[1]?.toUpperCase() ?? item.mediaType;
  return purpose ? `${purpose} image ${index + 1}, ${kind}` : `Image ${index + 1}, ${kind}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * A generic, app-agnostic image picker: a thumbnail + "choose"/"remove" pair that opens a dialog
 * to either pick an existing library item or upload a new one. Deliberately does no fetching
 * itself (SRS-ARC frontend convention — `@carrental/ui` never calls the API); the host app wires
 * `items`/`onUpload`/`onSelect` to its own hooks. Reused everywhere a picture is needed (vehicle
 * categories, fleet units, and future purposes) so every image-upload surface in the system
 * looks and behaves identically.
 */
export function MediaPicker({
  value,
  previewUrl,
  items,
  isLoading,
  isError,
  onUpload,
  onSelect,
  accept = 'image/png,image/jpeg,image/webp,image/svg+xml',
  labels,
  disabled,
  describeItem = defaultDescribeItem,
  'data-testid': testId,
}: {
  value: string | null;
  previewUrl: string | null;
  items: MediaPickerItem[];
  isLoading?: boolean;
  isError?: boolean;
  onUpload: (input: { dataBase64: string; mediaType: string }) => Promise<MediaPickerItem>;
  onSelect: (item: MediaPickerItem | null) => void;
  accept?: string;
  labels?: Partial<MediaPickerLabels>;
  disabled?: boolean;
  /** Accessible label for one grid thumbnail; override to localize or use richer per-item data. */
  describeItem?: (item: MediaPickerItem, index: number) => string;
  'data-testid'?: string;
}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const item = await onUpload({ dataBase64, mediaType: file.type });
      onSelect(item);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-testid={testId ? `${testId}-open` : undefined}
        >
          {t.change}
        </Button>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onSelect(null)}
            data-testid={testId ? `${testId}-remove` : undefined}
          >
            <Trash2 className="me-1.5 size-3.5" aria-hidden="true" />
            {t.remove}
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
              <input
                ref={fileInput}
                type="file"
                accept={accept}
                className="hidden"
                onChange={onFile}
              />
              <Button
                type="button"
                size="sm"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="me-1.5 size-3.5" aria-hidden="true" />
                {uploading ? t.uploading : t.upload}
              </Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              {isLoading ? (
                <div className="col-span-full flex justify-center py-6">
                  <Spinner />
                </div>
              ) : isError ? (
                <p className="col-span-full text-sm text-destructive">{t.loadFail}</p>
              ) : items.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground">{t.empty}</p>
              ) : (
                items.map((it, index) => (
                  <button
                    key={it.ref}
                    type="button"
                    aria-label={describeItem(it, index)}
                    aria-pressed={value === it.ref}
                    onClick={() => {
                      onSelect(it);
                      setOpen(false);
                    }}
                    className={cn(
                      'aspect-square overflow-hidden rounded-md border-2 transition-colors hover:border-ring',
                      value === it.ref ? 'border-ring' : 'border-transparent',
                    )}
                  >
                    <img src={it.url} alt="" className="size-full object-cover" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
