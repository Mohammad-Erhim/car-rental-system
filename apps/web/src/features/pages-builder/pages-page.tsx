import { useAuth } from '@carrental/client/react';
import {
  DEFAULT_PAGES_CONFIG,
  PAGE_KEYS,
  PAGE_ROUTES,
  zPagesConfig,
  type Block,
  type BlockType,
  type PageKey,
  type PagesConfig,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { BrandConfig } from '@carrental/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AddBlockDialog } from './add-block-dialog';
import { AnnouncementForm } from './announcement-form';
import { BLOCK_DEFS } from './block-defs';
import { BlocksPanel } from './blocks-panel';
import {
  ASSET_URL_RE,
  clone,
  makeBlock,
  mapStrings,
  moveById,
  PAGE_NAME_KEY,
  toStorageRef,
  type Viewport,
} from './builder-model';
import { ColoursForm } from './colours-form';
import { FieldControl } from './field-control';
import { PreviewPanel } from './preview-panel';
import { SaveDraftDialog } from './save-draft-dialog';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfigHistory } from '@/features/config-workflow/config-history';
import { useDeleteConfigVersion } from '@/lib/admin-hooks';
import { useMetaLocales } from '@/lib/api-hooks';
import { usePublishedBranding } from '@/lib/branding-hooks';
import {
  useDraftPages,
  usePagesTransition,
  usePagesVersions,
  usePublishedPages,
  useUploadPageAsset,
} from '@/lib/pages-hooks';
import { SITE_ORIGIN } from '@/lib/site-origin';
import { useListParams } from '@/lib/use-list-params';

type Panel = 'block' | 'announcement' | 'colours';

/**
 * SCREEN-OPS — Pages (the public site's layout). Each page is an ordered list of blocks with text
 * per language; edits show live in a preview of the real site and are saved as a draft revision a
 * different reviewer publishes. The site announcement and quick colour changes live here too. A
 * builder needs its controls and preview side by side, so this stays a workspace: blocks on the
 * left, the inspector in the middle, the preview on the right.
 */
export function PagesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(['tab'] as const);
  const tab = state.tab === 'history' ? 'history' : 'editor';

  const published = usePublishedPages();
  const versions = usePagesVersions();
  const draftMut = useDraftPages();
  const transition = usePagesTransition();
  const deleteVersion = useDeleteConfigVersion();
  const upload = useUploadPageAsset();
  const publishedBrand = usePublishedBranding();
  const metaLocales = useMetaLocales();
  const editLocales = useMemo(
    () => metaLocales.data?.locales.filter((l) => !l.testOnly).map((l) => l.code) ?? ['en'],
    [metaLocales.data],
  );

  const [draft, setDraft] = useState<PagesConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [brandDraft, setBrandDraft] = useState<BrandConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editPage, setEditPage] = useState<PageKey>('home');
  const [editLocale, setEditLocale] = useState('en');
  const [panel, setPanel] = useState<Panel>('block');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [addOpen, setAddOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const adopted = useRef(false);
  const brandAdopted = useRef(false);
  const assetUrls = useRef<Record<string, string>>({});
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewReady = useRef(false);

  const cfg = draft ?? published.data?.config ?? DEFAULT_PAGES_CONFIG;
  const blocks = cfg.pages[editPage]?.blocks ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Adopt the published config once. `/meta/pages` hands back resolved `/api/v1/assets/…` URLs in
  // image fields — remember each against its `obj:` ref (so the inspector and preview can show
  // it) but keep the durable `obj:` ref in the draft that is edited and saved.
  useEffect(() => {
    if (published.data && !adopted.current) {
      adopted.current = true;
      setDraft(
        mapStrings(published.data.config, (s) => {
          const m = s.match(ASSET_URL_RE);
          if (m) {
            assetUrls.current[`obj:${m[1]}`] = s;
            return `obj:${m[1]}`;
          }
          return s;
        }),
      );
    }
  }, [published.data]);
  useEffect(() => {
    if (publishedBrand.data && !brandAdopted.current) {
      brandAdopted.current = true;
      setBrandDraft(clone(publishedBrand.data.config));
    }
  }, [publishedBrand.data]);
  const brandForPreview = brandDraft ?? publishedBrand.data?.config ?? null;

  // Whole-config rules the API also enforces — checked against the whole config, never just the
  // page being viewed, so a broken home page can't look clean while another tab is open.
  const issues = useMemo(() => {
    const parsed = zPagesConfig.safeParse(cfg);
    if (parsed.success) {
      return (cfg.pages.home?.blocks ?? []).some((b) => b.type === 'search-card' && !b.hidden)
        ? []
        : [t('ops.pages.searchRequired')];
    }
    return parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  }, [cfg, t]);

  const mutate = (next: PagesConfig) => {
    setDraft(clone(next));
    setDirty(true);
  };
  const setBlocks = (next: Block[]) =>
    mutate({ ...cfg, pages: { ...cfg.pages, [editPage]: { blocks: next } } });
  const updateBlock = (id: string, fn: (b: Block) => Block) =>
    setBlocks(blocks.map((b) => (b.id === id ? fn(clone(b)) : b)));
  const addBlock = (type: BlockType) => {
    const b = makeBlock(type);
    setBlocks([...blocks, b]);
    setSelectedId(b.id);
    setPanel('block');
    setAddOpen(false);
  };
  const changePage = (p: PageKey) => {
    if (p === editPage) return;
    setEditPage(p);
    setSelectedId(null);
    previewReady.current = false;
  };

  // ---- live preview: post the draft to the frame (debounced) ----
  const postPreview = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (
      payloadBlocks: Block[],
      locale: string,
      brand: BrandConfig | null,
      announcement: PagesConfig['announcement'] | null,
    ) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const resolved = mapStrings(payloadBlocks, (s) =>
          s.startsWith('obj:') && assetUrls.current[s] ? assetUrls.current[s]! : s,
        );
        frameRef.current?.contentWindow?.postMessage(
          {
            type: 'carrental:preview:update',
            v: 1,
            payload: { blocks: resolved, locale, brand, announcement: announcement ?? null },
          },
          SITE_ORIGIN,
        );
      }, 180);
    };
  }, []);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== SITE_ORIGIN) return;
      if ((e.data as { type?: string })?.type === 'carrental:preview:ready') {
        previewReady.current = true;
        postPreview(blocks, editLocale, brandForPreview, cfg.announcement ?? null);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [blocks, editLocale, brandForPreview, cfg.announcement, postPreview]);
  useEffect(() => {
    if (previewReady.current)
      postPreview(blocks, editLocale, brandForPreview, cfg.announcement ?? null);
  }, [blocks, editLocale, brandForPreview, cfg.announcement, postPreview]);

  async function onUpload(
    purpose: 'heroImage' | 'pageImage',
    file: File,
    onRef: (ref: string, w: number | null, h: number | null) => void,
  ) {
    try {
      const res = await upload.mutateAsync({ purpose, file });
      assetUrls.current[res.ref] = res.url;
      onRef(res.ref, res.width, res.height);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.pages.uploadFail'));
    }
  }

  async function saveDraft(note: string) {
    const parsed = zPagesConfig.safeParse(mapStrings(cfg, toStorageRef));
    if (!parsed.success) throw new Error(t('ops.pages.validationFailed'));
    await draftMut.mutateAsync({ payload: parsed.data, note: note || undefined });
    toast.success(t('ops.pages.draftSaved'));
    setDirty(false);
    update({ tab: 'history' });
  }

  if (published.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.pages.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void published.refetch()}
        />
      </Page>
    );
  }
  // gate on the load: `cfg` falls back to the built-in layout for one render otherwise
  if (published.isLoading) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[32rem] rounded-xl" />
      </Page>
    );
  }

  const rev = published.data?.revision ?? 0;
  const disabled = !canPublish;
  const def = selected ? BLOCK_DEFS[selected.type] : null;

  return (
    <Page>
      <PageHeader
        title={t('ops.pages.title')}
        description={t('ops.pages.subtitle')}
        badge={
          <Badge variant={rev ? 'success' : 'secondary'}>
            {rev ? t('ops.pages.publishedRev', { n: rev }) : t('ops.pages.usingDefault')}
          </Badge>
        }
        actions={
          canPublish ? (
            <Button
              onClick={() => setSaveOpen(true)}
              disabled={!dirty || issues.length > 0}
              data-testid="pages-save"
            >
              {t('ops.pages.saveDraft')}
            </Button>
          ) : null
        }
      />

      <StateSwitcher
        label={t('ops.pages.title')}
        value={tab}
        onChange={(v) => update({ tab: v === 'editor' ? '' : v })}
        testIdPrefix="pages-tab"
        options={[
          { value: 'editor', label: t('ops.pages.tabEditor') },
          {
            value: 'history',
            label: `${t('ops.pages.history')}${versions.data ? ` (${versions.data.length})` : ''}`,
          },
        ]}
      />

      {tab === 'history' ? (
        <SectionCard title={t('ops.pages.history')} description={t('ops.branding.historyHint')}>
          <ConfigHistory
            versions={versions.data}
            isLoading={versions.isLoading}
            canPublish={canPublish}
            pending={transition.isPending}
            onAction={transition.mutateAsync}
            onDelete={deleteVersion.mutateAsync}
          />
        </SectionCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StateSwitcher
              label={t('ops.pages.page')}
              value={editPage}
              onChange={(v) => changePage(v as PageKey)}
              testIdPrefix="pages-page"
              options={PAGE_KEYS.map((p) => ({
                value: p,
                label: t(`ops.pages.pageName.${PAGE_NAME_KEY[p]}`),
              }))}
            />
            <span className="bidi-isolate text-xs text-muted-foreground">
              /{editLocale}
              {PAGE_ROUTES[editPage]}
            </span>
          </div>

          {issues.length ? (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc space-y-0.5 ps-4">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] [&>*]:min-w-0">
            <div className="space-y-6">
              <BlocksPanel
                blocks={blocks}
                page={editPage}
                selectedId={selectedId}
                canEdit={canPublish}
                onSelect={(id) => {
                  setSelectedId(id);
                  setPanel('block');
                }}
                onMove={(id, dir) => setBlocks(moveById(blocks, id, dir))}
                onToggleHidden={(id) => updateBlock(id, (x) => ({ ...x, hidden: !x.hidden }))}
                onDelete={setConfirmDelete}
                onAdd={() => setAddOpen(true)}
              />

              <SectionCard
                title={panel === 'block' && def ? t(def.label) : t('ops.pages.inspector')}
                contentClassName="space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StateSwitcher
                    label={t('ops.pages.inspector')}
                    value={panel}
                    onChange={(v) => setPanel(v as Panel)}
                    testIdPrefix="pages-panel"
                    options={[
                      { value: 'block', label: t('ops.pages.panelBlock') },
                      { value: 'announcement', label: t('ops.pages.panelAnnouncement') },
                      { value: 'colours', label: t('ops.pages.panelColours') },
                    ]}
                  />
                  {editLocales.length > 1 ? (
                    <StateSwitcher
                      label={t('ops.pages.locale')}
                      value={editLocale}
                      onChange={setEditLocale}
                      testIdPrefix="pages-locale"
                      options={editLocales.map((l) => ({ value: l, label: l.toUpperCase() }))}
                    />
                  ) : null}
                </div>
                {editLocale !== 'en' ? (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {t('ops.pages.localeFallbackHint')}
                  </p>
                ) : null}

                {panel === 'announcement' ? (
                  <AnnouncementForm
                    value={cfg.announcement ?? null}
                    locale={editLocale}
                    disabled={disabled}
                    onChange={(a) => mutate({ ...cfg, announcement: a ?? undefined })}
                  />
                ) : panel === 'colours' ? (
                  <ColoursForm
                    value={brandDraft}
                    published={publishedBrand.data?.config ?? null}
                    disabled={disabled}
                    onChange={setBrandDraft}
                    onSaved={() => undefined}
                  />
                ) : !selected || !def ? (
                  <p className="text-sm text-muted-foreground">{t('ops.pages.selectHint')}</p>
                ) : (
                  <fieldset disabled={disabled} className="space-y-4">
                    {def.supportsTone ? (
                      <div className="space-y-1.5">
                        <Label>{t('ops.pages.tone')}</Label>
                        <Select
                          value={selected.tone}
                          onValueChange={(v) =>
                            updateBlock(selected.id, (x) => ({ ...x, tone: v as Block['tone'] }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['default', 'muted', 'brand'] as const).map((tn) => (
                              <SelectItem key={tn} value={tn}>
                                {t(`ops.pages.tone.${tn}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {def.fields.map((f) => (
                      <FieldControl
                        key={`${selected.id}-${f.key}`}
                        def={f}
                        idPrefix={`blk-${selected.id}`}
                        value={(selected.props as Record<string, unknown>)[f.key]}
                        locale={editLocale}
                        assetUrls={assetUrls.current}
                        uploading={upload.isPending}
                        onExpand={setLightbox}
                        onUpload={(file, cb) => void onUpload(f.purpose ?? 'pageImage', file, cb)}
                        onChange={(v) =>
                          updateBlock(
                            selected.id,
                            (x) =>
                              ({
                                ...x,
                                props: { ...(x.props as Record<string, unknown>), [f.key]: v },
                              }) as Block,
                          )
                        }
                      />
                    ))}
                  </fieldset>
                )}
              </SectionCard>
            </div>

            <div className="xl:sticky xl:top-20">
              <PreviewPanel
                key={editPage}
                frameRef={frameRef}
                src={`${SITE_ORIGIN}/${editLocale}${PAGE_ROUTES[editPage]}?preview=1`}
                viewport={viewport}
                onViewport={setViewport}
              />
            </div>
          </div>
        </>
      )}

      <AddBlockDialog blocks={blocks} onPick={addBlock} open={addOpen} onOpenChange={setAddOpen} />
      {saveOpen ? <SaveDraftDialog open onOpenChange={setSaveOpen} onSave={saveDraft} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirmDelete(null)}
          destructive
          title={t('ops.pages.deleteConfirmTitle')}
          description={t('ops.pages.deleteConfirm')}
          confirmLabel={t('ops.pages.delete')}
          onConfirm={async () => {
            setBlocks(blocks.filter((b) => b.id !== confirmDelete));
            if (selectedId === confirmDelete) setSelectedId(null);
          }}
        />
      ) : null}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent closeLabel={t('action.close')} className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ops.pages.asset.expand')}</DialogTitle>
          </DialogHeader>
          {lightbox ? (
            <img src={lightbox} alt="" className="max-h-[70dvh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
