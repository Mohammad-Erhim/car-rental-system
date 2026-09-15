import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  defaultDescribeItem,
  Field,
  Input,
  PageHeader,
  Toolbar,
} from '@carrental/ui';
import { useRef, useState } from 'react';

import { ApiError } from '../../lib/api.js';
import {
  useDeleteMedia,
  useMediaLibrary,
  useUploadMedia,
  type MediaItem,
} from '../../lib/media-hooks.js';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * SCREEN-OPS-041 — one page listing every image uploaded anywhere in the system (vehicle
 * categories, fleet units, branding, and any future purpose), backed directly by the existing
 * generic object-storage catalogue. Individual forms (categories, fleet units) embed their own
 * scoped `<MediaPicker>`; this page is the unscoped, system-wide browse/upload/delete view.
 */
export function MediaLibraryPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage', 'fleet.manage');

  const [purposeFilter, setPurposeFilter] = useState('');
  const media = useMediaLibrary(purposeFilter ? { purpose: purposeFilter } : {});
  const upload = useUploadMedia();
  const del = useDeleteMedia();

  const [uploadPurpose, setUploadPurpose] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!uploadPurpose.trim()) {
      setResult({ ok: false, text: t('ops.media.purposeRequired') });
      return;
    }
    setResult(null);
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      await upload.mutateAsync({
        purpose: uploadPurpose.trim(),
        dataBase64,
        mediaType: file.type,
      });
      setResult({ ok: true, text: t('ops.media.uploaded') });
    } catch (err) {
      setResult({ ok: false, text: errText(err, t('ops.media.uploadFail')) });
    } finally {
      setUploading(false);
    }
  }

  async function runDelete() {
    if (!deleting) return;
    setResult(null);
    try {
      await del.mutateAsync(deleting.id);
      setResult({ ok: true, text: t('ops.media.deleted') });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.media.deleteFail')) });
      throw e; // keep the confirm dialog open on failure
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.media.title')} description={t('ops.media.subtitle')} />

      {result ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} data-testid="media-result">
          <AlertTitle>{result.ok ? t('state.success.title') : t('state.failure.title')}</AlertTitle>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ops.media.upload')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={t('ops.media.purpose')}
                htmlFor="media-purpose"
                hint={t('ops.media.purposeHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={uploadPurpose}
                    onChange={(e) =>
                      setUploadPurpose(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    placeholder="vehicle_category"
                    data-testid="media-purpose"
                  />
                )}
              </Field>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onFile}
              />
              <Button
                type="button"
                loading={uploading}
                disabled={!uploadPurpose.trim()}
                onClick={() => fileInput.current?.click()}
                data-testid="media-upload-btn"
              >
                {t('ops.media.chooseFile')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.media.library')}</CardTitle>
          <Toolbar aria-label={t('ops.media.library')}>
            <Input
              aria-label={t('ops.media.filterPurpose')}
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              placeholder={t('ops.media.filterPurpose')}
              className="max-w-xs"
              data-testid="media-filter"
            />
          </Toolbar>
        </CardHeader>
        <CardContent>
          {media.isLoading ? (
            <AppStateView kind="loading" title={t('ops.st.loading')} inline />
          ) : media.isError ? (
            <AppStateView
              kind="failure"
              title={t('ops.media.loadFail')}
              inline
              primaryAction={{ label: t('ops.st.retry'), onClick: () => void media.refetch() }}
            />
          ) : (media.data ?? []).length === 0 ? (
            <AppStateView kind="empty" title={t('ops.media.empty')} inline />
          ) : (
            <div
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
              data-testid="media-grid"
            >
              {(media.data ?? []).map((m, index) => (
                <div
                  key={m.id}
                  className="space-y-1.5 rounded-md border p-2"
                  data-testid={`media-item-${m.id}`}
                >
                  <div className="aspect-square overflow-hidden rounded bg-muted">
                    {/* this page has no aria-label'd control describing the image the way
                        MediaPicker's grid buttons do, so — unlike that component — it's this
                        <img>'s own alt that needs to carry the description. */}
                    <img
                      src={m.url}
                      alt={defaultDescribeItem(m, index)}
                      className="size-full object-cover"
                    />
                  </div>
                  <Badge variant="neutral" className="max-w-full truncate text-[0.65rem]">
                    {m.purpose}
                  </Badge>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(m.sizeBytes)} · {fmt.date(m.createdAt)}
                  </p>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setDeleting(m)}
                      data-testid={`media-delete-${m.id}`}
                    >
                      {t('ops.media.delete')}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t('ops.media.deleteTitle')}
        description={t('ops.media.deleteBody')}
        confirmLabel={t('ops.media.delete')}
        onConfirm={runDelete}
      />
    </div>
  );
}
