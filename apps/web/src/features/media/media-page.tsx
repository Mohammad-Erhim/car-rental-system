import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { defaultDescribeItem } from '@carrental/ui';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { UploadDialog } from './upload-dialog';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/data-table/pagination';
import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteMedia, useMediaBrowse, type MediaItem } from '@/lib/media-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const PARAMS = ['purpose'] as const;
const ALL = '__all__';

type Modal =
  | { kind: 'upload' }
  | { kind: 'preview'; item: MediaItem; index: number }
  | { kind: 'delete'; item: MediaItem };

const formatBytes = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * SCREEN-OPS-041 — every image uploaded anywhere in the system (vehicle categories, fleet units,
 * branding, anything uploaded here), browsed a page at a time. Forms that need a picture embed
 * their own picker scoped to one purpose; this is the unscoped view: browse, upload, delete.
 * Deleting is refused by the API while an image is still in use.
 */
export function MediaLibraryPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage', 'fleet.manage');
  const { state, update } = useListParams(PARAMS);
  const [modal, setModal] = useState<Modal | null>(null);

  const library = useMediaBrowse({
    purpose: state.purpose || undefined,
    page: state.page,
    pageSize: state.pageSize,
  });
  const del = useDeleteMedia();
  const data = library.data;
  const items = data?.items ?? [];
  const purposes = data?.purposeCounts ?? [];
  const totalAll = purposes.reduce((sum, p) => sum + p.count, 0);

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.media.title')}
        description={t('ops.media.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setModal({ kind: 'upload' })} data-testid="media-upload-btn">
              <Upload aria-hidden="true" />
              {t('ops.media.upload')}
            </Button>
          ) : null
        }
      />

      <Card className="flex items-center gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Select
            value={state.purpose || ALL}
            onValueChange={(v) => update({ purpose: v === ALL ? '' : v })}
          >
            <SelectTrigger aria-label={t('ops.media.filterPurpose')} data-testid="media-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('ops.media.allPurposes')} ({totalAll})
              </SelectItem>
              {purposes.map((p) => (
                <SelectItem key={p.purpose} value={p.purpose}>
                  {p.purpose} ({p.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data ? (
          <p className="hidden text-sm text-muted-foreground sm:block">
            {t('ops.media.count', { n: data.total })}
          </p>
        ) : null}
      </Card>

      <section aria-label={t('ops.media.library')} data-testid="media-grid">
        {library.isLoading ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[4/3] rounded-xl" />
              </li>
            ))}
          </ul>
        ) : library.isError ? (
          <Card>
            <StateView
              kind="error"
              title={t('ops.media.loadFail')}
              actionLabel={t('ops.st.retry')}
              onAction={() => void library.refetch()}
              className="py-14"
            />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <StateView icon={ImageOff} title={t('ops.media.empty')} className="py-14">
              {canManage && !state.purpose ? (
                <Button size="sm" onClick={() => setModal({ kind: 'upload' })}>
                  <Upload aria-hidden="true" />
                  {t('ops.media.upload')}
                </Button>
              ) : null}
            </StateView>
          </Card>
        ) : (
          <ul
            className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 ${
              library.isPlaceholderData ? 'opacity-60' : ''
            }`}
          >
            {items.map((m, i) => (
              <li key={m.id} data-testid={`media-item-${m.id}`}>
                <Card className="group overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setModal({ kind: 'preview', item: m, index: i })}
                    className="block aspect-[4/3] w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <img
                      src={m.url}
                      alt={defaultDescribeItem(m, i)}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                  <div className="space-y-1 p-3">
                    <Badge variant="secondary" className="max-w-full truncate">
                      {m.purpose}
                    </Badge>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBytes(m.sizeBytes)} · {fmt.date(m.createdAt)}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > 0 ? (
          <Pagination
            className="mt-4"
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            pageSizeOptions={PAGE_SIZES}
            onPageChange={(p) => update({ page: p })}
            onPageSizeChange={(s) => update({ pageSize: s })}
          />
        ) : null}
      </section>

      {modal?.kind === 'upload' ? (
        <UploadDialog
          purposes={purposes.map((p) => p.purpose)}
          defaultPurpose={state.purpose}
          open
          onOpenChange={close}
        />
      ) : null}

      {modal?.kind === 'preview' ? (
        <Dialog open onOpenChange={close}>
          <DialogContent closeLabel={t('action.close')} className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{modal.item.purpose}</DialogTitle>
              <DialogDescription>
                {formatBytes(modal.item.sizeBytes)} · {modal.item.mediaType} ·{' '}
                {fmt.date(modal.item.createdAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[65dvh] place-items-center overflow-hidden rounded-lg border bg-muted">
              <img
                src={modal.item.url}
                alt={defaultDescribeItem(modal.item, modal.index)}
                className="max-h-[65dvh] max-w-full object-contain"
              />
            </div>
            {canManage ? (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setModal({ kind: 'delete', item: modal.item })}
                  data-testid={`media-delete-${modal.item.id}`}
                >
                  <Trash2 aria-hidden="true" />
                  {t('ops.media.delete')}
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}

      {modal?.kind === 'delete' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t('ops.media.deleteTitle')}
          description={t('ops.media.deleteBody')}
          confirmLabel={t('ops.media.delete')}
          onConfirm={async () => {
            await del.mutateAsync(modal.item.id);
            toast.success(t('ops.media.deleted'));
          }}
        />
      ) : null}
    </Page>
  );
}
