import { useAuth } from '@carrental/client/react';
import {
  DEFAULT_PAGES_CONFIG,
  PAGE_KEYS,
  PAGE_ROUTES,
  zAnnouncement,
  zBlock,
  zPagesConfig,
  type Announcement,
  type Block,
  type BlockType,
  type Localized,
  type PageKey,
  type PagesConfig,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  hexToHslTriple,
  hslTripleToHex,
  PRESETS,
  validateBrandConfig,
  type BrandConfig,
} from '@carrental/theme';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from '@carrental/ui';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useDeleteConfigVersion } from '../../../lib/admin-hooks.js';
import { useMetaLocales } from '../../../lib/api-hooks.js';
import {
  useBrandingTransition,
  useBrandingVersions,
  useDraftBranding,
  usePublishedBranding,
} from '../../../lib/branding-hooks.js';
import {
  useDraftPages,
  usePagesTransition,
  usePagesVersions,
  usePublishedPages,
  useUploadPageAsset,
} from '../../../lib/pages-hooks.js';
import { ConfigWorkflowHistory } from '../config-workflow-history.js';

import { BLOCK_DEFS, BLOCK_ORDER, ICON_OPTIONS, type FieldDef } from './block-defs.js';

// A page block's content is `Localized` — `{ en, ...anyOtherLocaleCode }` (DEC-024) — so which
// tabs this editor offers comes from the *runtime* enabled-locale set, not a fixed list; a
// language added from /ops/config/languages gets an editable tab here with no code change.
type EditLocale = string;
const SITE_ORIGIN = import.meta.env.VITE_SITE_URL || window.location.origin;

const PAGE_NAME_KEY: Record<PageKey, string> = {
  home: 'home',
  help: 'help',
  'legal-terms': 'legalTerms',
  'legal-privacy': 'legalPrivacy',
  'legal-cookies': 'legalCookies',
};

const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const newId = () => Math.random().toString(36).slice(2, 10);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Deep-map every string value in a JSON-serialisable tree. */
function mapStrings<T>(node: T, fn: (s: string) => string): T {
  return JSON.parse(JSON.stringify(node, (_k, v) => (typeof v === 'string' ? fn(v) : v))) as T;
}
const ASSET_URL_RE = /^(?:https?:\/\/[^/]+)?\/api\/v1\/assets\/([A-Za-z0-9._/-]+)\?/;
/** `/api/v1/assets/<key>?…` (or `obj:<key>`) → `obj:<key>`; anything else unchanged. */
const toStorageRef = (s: string): string => {
  const m = s.match(ASSET_URL_RE);
  return m ? `obj:${m[1]}` : s;
};
const isLocalized = (v: unknown): v is Localized =>
  !!v && typeof v === 'object' && 'en' in (v as Record<string, unknown>);

function makeBlock(type: BlockType): Block {
  return zBlock.parse({
    id: newId(),
    type,
    tone: type === 'hero' || type === 'stats' ? 'brand' : 'default',
  });
}

export function PagesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

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
  const [brandDraft, setBrandDraft] = useState<BrandConfig | null>(null);
  const brandAdopted = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editPage, setEditPage] = useState<PageKey>('home');
  const [editLocale, setEditLocale] = useState<EditLocale>('en');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [note, setNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const adopted = useRef(false);
  const assetUrls = useRef<Record<string, string>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewReady = useRef(false);

  const cfg = draft ?? published.data?.config ?? DEFAULT_PAGES_CONFIG;
  const blocks = cfg.pages[editPage]?.blocks ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // adopt the published config once. `/meta/pages` hands back resolved `/api/v1/assets/…` URLs
  // in image fields — stash each against its `obj:` ref (so the inspector + preview can still
  // show it) but keep the durable `obj:` ref in the draft we edit and later save.
  useEffect(() => {
    if (published.data && !adopted.current) {
      adopted.current = true;
      if (!draft) {
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
    }
  }, [published.data, draft]);

  useEffect(() => {
    if (publishedBrand.data && !brandAdopted.current) {
      brandAdopted.current = true;
      if (!brandDraft) setBrandDraft(clone(publishedBrand.data.config));
    }
  }, [publishedBrand.data, brandDraft]);
  const brandForPreview = brandDraft ?? publishedBrand.data?.config ?? null;

  const issues = useMemo(() => {
    const parsed = zPagesConfig.safeParse(cfg);
    if (parsed.success) {
      if (
        editPage === 'home' &&
        !(cfg.pages.home?.blocks ?? []).some((b) => b.type === 'search-card' && !b.hidden)
      ) {
        return [t('ops.pages.searchRequired')];
      }
      return [];
    }
    return parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  }, [cfg, editPage, t]);

  function mutate(next: PagesConfig) {
    setDraft(clone(next));
  }
  function changePage(p: PageKey) {
    if (p === editPage) return;
    setEditPage(p);
    setSelectedId(null);
    previewReady.current = false;
  }
  function setBlocks(nextBlocks: Block[]) {
    mutate({ ...cfg, pages: { ...cfg.pages, [editPage]: { blocks: nextBlocks } } });
  }
  function updateBlock(id: string, patch: (b: Block) => Block) {
    setBlocks(blocks.map((b) => (b.id === id ? patch(clone(b)) : b)));
  }
  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setBlocks(next);
  }
  function addBlock(type: BlockType) {
    const b = makeBlock(type);
    setBlocks([...blocks, b]);
    setSelectedId(b.id);
    setAddOpen(false);
  }

  // ---- live preview: post the draft to the iframe (debounced) ----
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
        // swap `obj:` refs for their resolved URL so the preview <img> can load them
        const resolved = mapStrings(payloadBlocks, (s) =>
          s.startsWith('obj:') && assetUrls.current[s] ? assetUrls.current[s]! : s,
        );
        iframeRef.current?.contentWindow?.postMessage(
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
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t('ops.pages.uploadFail') });
    }
  }

  function saveDraft() {
    if (issues.length) return;
    const parsed = zPagesConfig.safeParse(mapStrings(cfg, toStorageRef));
    if (!parsed.success) {
      toast({ title: t('ops.pages.validationFailed') });
      return;
    }
    draftMut.mutate(
      { payload: parsed.data, note: note.trim() || undefined },
      {
        onSuccess: () => versions.refetch(),
        onError: (e) => toast({ title: e instanceof Error ? e.message : t('ops.pages.draftFail') }),
      },
    );
  }

  const publishedRev = published.data?.revision ?? 0;

  // Emulate device widths by rendering the iframe at a real width and scaling it to fit.
  const DEVICE_W: Record<typeof viewport, number> = { desktop: 1280, tablet: 834, mobile: 390 };
  const PREVIEW_H = 760;
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(560);
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const deviceW = DEVICE_W[viewport];
  const scale = Math.min(1, Math.max(0.2, (containerW - 4) / deviceW));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ops.pages.title')}
        description={t('ops.pages.subtitle')}
        actions={
          <Badge variant={publishedRev ? 'success' : 'neutral'}>
            {publishedRev
              ? t('ops.pages.publishedRev', { n: publishedRev })
              : t('ops.pages.usingDefault')}
          </Badge>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t('ops.pages.page')}</span>
        <div
          className="flex flex-wrap gap-0.5 rounded-md border p-0.5"
          role="tablist"
          aria-label={t('ops.pages.page')}
        >
          {PAGE_KEYS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={editPage === p}
              className={`rounded px-3 py-1.5 text-sm ${
                editPage === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => changePage(p)}
            >
              {t(`ops.pages.pageName.${PAGE_NAME_KEY[p]}`)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          /{editLocale}
          {PAGE_ROUTES[editPage]}
        </span>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[17rem_19rem_minmax(0,1fr)] [&>*]:min-w-0">
        {/* ---- block list ---- */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('ops.pages.blocksPanel')}</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={!canPublish}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" /> {t('ops.pages.addBlock')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {blocks.map((b, i) => {
              const def = BLOCK_DEFS[b.type];
              const btn =
                'rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25';
              return (
                <div
                  key={b.id}
                  className={`rounded-md border ${
                    b.id === selectedId
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  } ${b.hidden ? 'opacity-50' : ''}`}
                >
                  <button
                    type="button"
                    aria-pressed={b.id === selectedId}
                    className="flex w-full items-center gap-2 px-2 pt-1.5 text-start text-sm"
                    onClick={() => setSelectedId(b.id)}
                  >
                    <GripVertical
                      className="size-3.5 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                    <def.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{t(def.label)}</span>
                    {def.required ? <span className="text-xs text-muted-foreground">*</span> : null}
                  </button>
                  <div className="flex justify-end gap-0.5 px-1 pb-1">
                    <button
                      type="button"
                      className={btn}
                      disabled={!canPublish || i === 0}
                      aria-label={t('ops.pages.moveUp')}
                      onClick={() => move(b.id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={!canPublish || i === blocks.length - 1}
                      aria-label={t('ops.pages.moveDown')}
                      onClick={() => move(b.id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={!canPublish || def.required}
                      aria-label={b.hidden ? t('ops.pages.show') : t('ops.pages.hide')}
                      onClick={() => updateBlock(b.id, (x) => ({ ...x, hidden: !x.hidden }))}
                    >
                      {b.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      className={`${btn} hover:text-destructive`}
                      disabled={!canPublish || def.required}
                      aria-label={t('ops.pages.delete')}
                      onClick={() => setConfirmDelete(b.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ---- inspector + workflow (column 2) ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {selected ? t(BLOCK_DEFS[selected.type].label) : t('ops.pages.inspector')}
              </CardTitle>
              <div
                className="flex gap-1 rounded-md border p-0.5"
                role="tablist"
                aria-label={t('ops.pages.locale')}
              >
                {editLocales.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={editLocale === l}
                    className={`rounded px-2.5 py-1 text-xs uppercase ${
                      editLocale === l
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    }`}
                    onClick={() => setEditLocale(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">{t('ops.pages.selectHint')}</p>
              ) : (
                <>
                  {editLocale !== 'en' ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {t('ops.pages.localeFallbackHint')}
                    </p>
                  ) : null}
                  {/* a config.read-only viewer reaches this screen too (@Permissions is an "any"
                      gate on the shared list/preview reads) — disable every write control here
                      instead of letting them edit freely and only find out on save that the
                      backend requires config.publish. */}
                  <fieldset disabled={!canPublish} className="contents space-y-4">
                    {BLOCK_DEFS[selected.type].supportsTone ? (
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-muted-foreground">
                          {t('ops.pages.tone')}
                        </span>
                        <select
                          className={selectClass}
                          value={selected.tone}
                          onChange={(e) =>
                            updateBlock(selected.id, (x) => ({
                              ...x,
                              tone: e.target.value as Block['tone'],
                            }))
                          }
                        >
                          {(['default', 'muted', 'brand'] as const).map((tn) => (
                            <option key={tn} value={tn}>
                              {t(`ops.pages.tone.${tn}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {BLOCK_DEFS[selected.type].fields.map((f) => (
                      <FieldControl
                        key={f.key}
                        def={f}
                        value={(selected.props as Record<string, unknown>)[f.key]}
                        locale={editLocale}
                        t={t}
                        assetUrls={assetUrls.current}
                        uploading={upload.isPending}
                        onExpand={setLightbox}
                        onUpload={(file, cb) => onUpload(f.purpose ?? 'pageImage', file, cb)}
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
                </>
              )}
            </CardContent>
          </Card>

          <AnnouncementPanel
            value={cfg.announcement ?? null}
            locale={editLocale}
            disabled={!canPublish}
            onChange={(a) => mutate({ ...cfg, announcement: a ?? undefined })}
          />

          <ColoursPanel
            value={brandDraft}
            published={publishedBrand.data?.config ?? null}
            onChange={setBrandDraft}
          />

          <Card>
            <CardContent className="space-y-3 pt-6">
              {issues.length ? (
                <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
              <Textarea
                value={note}
                disabled={!canPublish}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('ops.pages.notePlaceholder')}
                className="min-h-[60px] text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canPublish || !draft || issues.length > 0 || draftMut.isPending}
                  loading={draftMut.isPending}
                  onClick={saveDraft}
                >
                  {t('ops.pages.saveDraft')}
                </Button>
                {draftMut.isSuccess ? (
                  <span className="self-center text-xs text-success">
                    {t('ops.pages.draftSaved')}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.pages.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfigWorkflowHistory
                versions={versions.data}
                isLoading={versions.isLoading}
                canPublish={canPublish}
                pending={transition.isPending}
                onAction={transition.mutateAsync}
                onDelete={deleteVersion.mutateAsync}
              />
            </CardContent>
          </Card>
        </div>

        {/* ---- live preview (column 3) ---- */}
        <div className="xl:sticky xl:top-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {t('ops.pages.preview')}
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {t(`ops.pages.viewport.${viewport}`)} · {Math.round(scale * 100)}%
                </span>
              </CardTitle>
              <div className="flex gap-1 rounded-md border p-0.5">
                {(
                  [
                    ['desktop', Monitor],
                    ['tablet', Tablet],
                    ['mobile', Smartphone],
                  ] as const
                ).map(([v, I]) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={t(`ops.pages.viewport.${v}`)}
                    aria-pressed={viewport === v}
                    className={`rounded p-1.5 ${viewport === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setViewport(v)}
                  >
                    <I className="size-4" />
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div ref={previewWrapRef} className="overflow-hidden rounded-lg border bg-muted/40">
                <div
                  className="mx-auto"
                  style={{ width: Math.round(deviceW * scale), height: PREVIEW_H }}
                >
                  <iframe
                    key={editPage}
                    ref={iframeRef}
                    title={t('ops.pages.previewFrameTitle')}
                    src={`${SITE_ORIGIN}/${editLocale}${PAGE_ROUTES[editPage]}?preview=1`}
                    style={{
                      width: deviceW,
                      height: Math.round(PREVIEW_H / scale),
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      border: 0,
                      display: 'block',
                      background: 'hsl(var(--background))',
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('ops.pages.previewHint')}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* add-block palette */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ops.pages.paletteTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {BLOCK_ORDER.map((type) => {
              const def = BLOCK_DEFS[type];
              const disabled = def.singleton && blocks.some((b) => b.type === type);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => addBlock(type)}
                  className="flex items-start gap-2 rounded-lg border p-3 text-start hover:border-primary disabled:opacity-40"
                >
                  <def.Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t(def.label)}</span>
                    <span className="block text-xs text-muted-foreground">{t(def.hint)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={t('ops.pages.deleteConfirmTitle')}
        description={t('ops.pages.deleteConfirm')}
        confirmLabel={t('ops.pages.delete')}
        cancelLabel={t('action.cancel')}
        destructive
        onConfirm={() => {
          if (confirmDelete) setBlocks(blocks.filter((b) => b.id !== confirmDelete));
          setConfirmDelete(null);
        }}
      />

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ops.pages.asset.expand')}</DialogTitle>
          </DialogHeader>
          {lightbox ? (
            <img src={lightbox} alt="" className="max-h-[70vh] w-full rounded object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------- field control */

type TFn = (k: string, p?: Record<string, string | number>) => string;

function FieldControl({
  def,
  value,
  locale,
  t,
  assetUrls,
  uploading,
  onChange,
  onUpload,
  onExpand,
}: {
  def: FieldDef;
  value: unknown;
  locale: EditLocale;
  t: TFn;
  assetUrls: Record<string, string>;
  uploading: boolean;
  onChange: (v: unknown) => void;
  onUpload: (file: File, cb: (ref: string, w: number | null, h: number | null) => void) => void;
  onExpand: (url: string) => void;
}) {
  const label = (
    <span className="flex items-center justify-between font-medium text-muted-foreground">
      {t(def.label)}
      {def.hint ? <span className="text-[0.7rem] normal-case">{t(def.hint)}</span> : null}
    </span>
  );

  if (def.kind === 'ltext' || def.kind === 'larea') {
    const lv = isLocalized(value) ? value : { en: '' };
    const cur = (lv as Record<string, string | undefined>)[locale] ?? '';
    const set = (s: string) => onChange({ ...lv, [locale]: s || undefined });
    return (
      <label className="block space-y-1 text-sm">
        {label}
        {def.kind === 'larea' ? (
          <Textarea
            value={cur}
            placeholder={locale !== 'en' ? lv.en : ''}
            onChange={(e) => set(e.target.value)}
            className="min-h-[64px] text-sm"
          />
        ) : (
          <Input
            value={cur}
            placeholder={locale !== 'en' ? lv.en : ''}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </label>
    );
  }

  if (def.kind === 'text') {
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <Input
          value={typeof value === 'string' ? value : ''}
          maxLength={def.max}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (def.kind === 'num') {
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <Input
          type="number"
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          value={typeof value === 'number' ? value : (def.min ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }

  if (def.kind === 'bool') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-medium text-muted-foreground">{t(def.label)}</span>
      </label>
    );
  }

  if (def.kind === 'select') {
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <select
          className={selectClass}
          value={typeof value === 'string' ? value : def.options?.[0]}
          onChange={(e) => onChange(e.target.value)}
        >
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (def.kind === 'icon') {
    return (
      <label className="block space-y-1 text-sm">
        {label}
        <select
          className={selectClass}
          value={typeof value === 'string' ? value : ICON_OPTIONS[0]}
          onChange={(e) => onChange(e.target.value)}
        >
          {ICON_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (def.kind === 'link') {
    const lv = (value ?? null) as { label?: Localized; href?: string } | null;
    const labelText = isLocalized(lv?.label)
      ? ((lv!.label as Record<string, string>)[locale] ?? '')
      : '';
    return (
      <fieldset className="space-y-1.5 rounded-md border p-2 text-sm">
        <legend className="px-1 font-medium text-muted-foreground">{t(def.label)}</legend>
        <Input
          value={labelText}
          placeholder={t('ops.pages.field.label')}
          onChange={(e) =>
            onChange({
              ...(lv ?? {}),
              label: {
                ...(isLocalized(lv?.label) ? lv!.label : { en: '' }),
                [locale]: e.target.value || undefined,
              },
            })
          }
        />
        <Input
          value={lv?.href ?? ''}
          placeholder="#book · /en/search · https://…"
          onChange={(e) => onChange({ ...(lv ?? { label: { en: '' } }), href: e.target.value })}
        />
      </fieldset>
    );
  }

  if (def.kind === 'asset') {
    const ref = typeof value === 'string' ? value : null;
    const url =
      ref && ref !== 'obj:placeholder'
        ? (assetUrls[ref] ?? (ref.startsWith('http') ? ref : null))
        : null;
    return (
      <div className="space-y-1 text-sm">
        {label}
        {url ? (
          <div className="flex items-center gap-2">
            <img src={url} alt="" className="h-16 w-24 rounded border object-cover" />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary"
                onClick={() => onExpand(url)}
              >
                <Maximize2 className="size-3.5" /> {t('ops.pages.asset.expand')}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary">
                <RefreshCw className="size-3.5" /> {t('ops.pages.asset.replace')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) onUpload(f, (r) => onChange(r));
                  }}
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onChange(def.key === 'src' ? 'obj:placeholder' : null)}
              >
                <Trash2 className="size-3.5" /> {t('ops.pages.asset.remove')}
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-xs text-muted-foreground hover:border-primary">
            <Upload className="size-4" />
            {uploading ? t('ops.pages.asset.uploading') : t('ops.pages.asset.upload')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onUpload(f, (r) => onChange(r));
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (def.kind === 'list') {
    const arr = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    const setItem = (i: number, patch: Record<string, unknown>) =>
      onChange(arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    return (
      <div className="space-y-2 text-sm">
        {label}
        {arr.map((it, i) => (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">#{i + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={i === 0}
                  className="p-0.5 disabled:opacity-30"
                  onClick={() => onChange(swap(arr, i, i - 1))}
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={i === arr.length - 1}
                  className="p-0.5 disabled:opacity-30"
                  onClick={() => onChange(swap(arr, i, i + 1))}
                >
                  <ArrowDown className="size-3" />
                </button>
                <button
                  type="button"
                  className="p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(arr.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
            {def.itemFields?.map((sf) => (
              <FieldControl
                key={sf.key}
                def={sf}
                value={it[sf.key]}
                locale={locale}
                t={t}
                assetUrls={assetUrls}
                uploading={uploading}
                onExpand={onExpand}
                onUpload={onUpload}
                onChange={(v) => setItem(i, { [sf.key]: v })}
              />
            ))}
          </div>
        ))}
        {arr.length < (def.itemMax ?? 8) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange([...arr, emptyItem(def.itemFields ?? [])])}
          >
            <Plus className="size-3.5" /> {t('ops.pages.addItem')}
          </Button>
        ) : null}
      </div>
    );
  }

  return null;
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const n = [...a];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}
function emptyItem(fields: FieldDef[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'ltext' || f.kind === 'larea') o[f.key] = { en: '' };
    else if (f.kind === 'icon') o[f.key] = ICON_OPTIONS[0];
    else if (f.kind === 'num') o[f.key] = f.min ?? 0;
    else if (f.kind === 'bool') o[f.key] = false;
    else if (f.kind === 'text') o[f.key] = '';
  }
  return o;
}

/* ---------------------------------------------------------- announcement panel */

const ANNOUNCE_VARIANTS = ['info', 'success', 'warning', 'critical'] as const;

function AnnouncementPanel({
  value,
  locale,
  disabled,
  onChange,
}: {
  value: Announcement | null;
  locale: EditLocale;
  disabled: boolean;
  onChange: (a: Announcement | null) => void;
}) {
  const { t } = useI18n();
  const base: Announcement = value ?? zAnnouncement.parse({ message: { en: '' } });
  const set = (patch: Partial<Announcement>) => onChange({ ...base, ...patch });
  const msg = (base.message as Record<string, string | undefined>)[locale] ?? '';
  const ctaLabel = base.cta
    ? ((base.cta.label as Record<string, string | undefined>)[locale] ?? '')
    : '';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t('ops.pages.announce.title')}</CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={base.enabled}
            disabled={disabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          {t('ops.pages.announce.enable')}
        </label>
      </CardHeader>
      <CardContent className="text-sm">
        <fieldset disabled={disabled} className="contents space-y-3">
          <p className="text-xs text-muted-foreground">{t('ops.pages.announce.hint')}</p>

          <label className="block space-y-1">
            <span className="font-medium text-muted-foreground">
              {t('ops.pages.announce.message')}
            </span>
            <Input
              value={msg}
              placeholder={locale !== 'en' ? base.message.en : ''}
              maxLength={200}
              onChange={(e) =>
                set({
                  message: {
                    ...base.message,
                    [locale]: locale === 'en' ? e.target.value : e.target.value || undefined,
                  } as Localized,
                })
              }
            />
          </label>

          <label className="block space-y-1">
            <span className="font-medium text-muted-foreground">
              {t('ops.pages.announce.variant')}
            </span>
            <select
              className={selectClass}
              value={base.variant}
              onChange={(e) => set({ variant: e.target.value as Announcement['variant'] })}
            >
              {ANNOUNCE_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {t(`ops.pages.announce.variant.${v}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-medium text-muted-foreground">
                {t('ops.pages.announce.ctaLabel')}
              </span>
              <Input
                value={ctaLabel}
                maxLength={60}
                onChange={(e) => {
                  const label = {
                    ...(base.cta?.label ?? { en: '' }),
                    [locale]: locale === 'en' ? e.target.value : e.target.value || undefined,
                  } as Localized;
                  set({ cta: { label, href: base.cta?.href ?? '' } });
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium text-muted-foreground">
                {t('ops.pages.announce.ctaHref')}
              </span>
              <Input
                value={base.cta?.href ?? ''}
                placeholder="/en/search · https://…"
                onChange={(e) => {
                  const href = e.target.value;
                  if (!href && !ctaLabel) return set({ cta: null });
                  set({ cta: { label: base.cta?.label ?? { en: '' }, href } });
                }}
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={base.dismissible}
              onChange={(e) => set({ dismissible: e.target.checked })}
            />
            <span className="font-medium text-muted-foreground">
              {t('ops.pages.announce.dismissible')}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="flex items-center justify-between font-medium text-muted-foreground">
              {t('ops.pages.announce.campaignId')}
              <span className="text-[0.7rem] normal-case">
                {t('ops.pages.announce.campaignIdHint')}
              </span>
            </span>
            <Input
              value={base.id}
              maxLength={40}
              onChange={(e) =>
                set({ id: e.target.value.replace(/[^A-Za-z0-9._-]/g, '-') || 'announcement' })
              }
            />
          </label>
        </fieldset>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- colours panel */

const COLOUR_TOKENS = [
  'primary',
  'primaryForeground',
  'background',
  'foreground',
  'accent',
  'accentForeground',
  'ring',
] as const;

function ColoursPanel({
  value,
  published,
  onChange,
}: {
  value: BrandConfig | null;
  published: BrandConfig | null;
  onChange: (b: BrandConfig) => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const draftBrand = useDraftBranding();
  const brandVersions = useBrandingVersions();
  const brandTransition = useBrandingTransition();
  const deleteBrandVersion = useDeleteConfigVersion();
  const [note, setNote] = useState('');

  if (!value) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.pages.colours')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">…</p>
        </CardContent>
      </Card>
    );
  }

  const violations = validateBrandConfig(value);
  const setToken = (token: (typeof COLOUR_TOKENS)[number], hex: string) => {
    const triple = hexToHslTriple(hex);
    if (!triple) return;
    onChange({
      ...value,
      colors: { ...value.colors, light: { ...value.colors.light, [token]: triple } },
    });
  };
  const activePreset = PRESETS.find(
    (p) => JSON.stringify(p.config.colors) === JSON.stringify(value.colors),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ops.pages.colours')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{t('ops.pages.coloursHint')}</p>

        <fieldset disabled={!canPublish} className="contents space-y-4">
          <div className="space-y-1.5">
            <span className="font-medium text-muted-foreground">{t('ops.pages.colourPreset')}</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activePreset?.id === p.id}
                  title={p.description}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    activePreset?.id === p.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary'
                  }`}
                  onClick={() => onChange({ ...value, colors: clone(p.config.colors) })}
                >
                  <span
                    className="size-3 rounded-full border"
                    style={{ background: hslTripleToHex(p.config.colors.light.primary) }}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {COLOUR_TOKENS.map((token) => (
              <label key={token} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t(`ops.pages.colourToken.${token}`)}
                  value={hslTripleToHex(value.colors.light[token])}
                  onChange={(e) => setToken(token, e.target.value)}
                  className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {t(`ops.pages.colourToken.${token}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {violations.length ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <p>{t('ops.pages.coloursContrast')}</p>
            <ul className="mt-1 list-disc ps-4">
              {violations.slice(0, 4).map((v) => (
                <li key={`${v.mode}-${v.fg}-${v.bg}`}>
                  {v.mode}: {v.fg} on {v.bg} — {v.ratio}:1
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Textarea
          value={note}
          disabled={!canPublish}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('ops.pages.notePlaceholder')}
          className="min-h-[52px] text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!canPublish || violations.length > 0 || draftBrand.isPending}
            loading={draftBrand.isPending}
            onClick={() =>
              draftBrand.mutate(
                { payload: value, note: note.trim() || undefined },
                {
                  onSuccess: () => brandVersions.refetch(),
                  onError: (e) =>
                    toast({ title: e instanceof Error ? e.message : t('ops.pages.draftFail') }),
                },
              )
            }
          >
            {t('ops.pages.coloursSave')}
          </Button>
          {published ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(clone(published))}
              disabled={JSON.stringify(published.colors) === JSON.stringify(value.colors)}
            >
              {t('ops.pages.colourReset')}
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <RouterLink to="/config/branding">{t('ops.pages.editColoursLink')}</RouterLink>
          </Button>
          {draftBrand.isSuccess ? (
            <span className="text-xs text-success">{t('ops.pages.colourSaved')}</span>
          ) : null}
        </div>

        {brandVersions.data?.length ? (
          <div className="border-t pt-2">
            <ConfigWorkflowHistory
              versions={brandVersions.data}
              canPublish={canPublish}
              pending={brandTransition.isPending}
              limit={4}
              onAction={brandTransition.mutateAsync}
              onDelete={deleteBrandVersion.mutateAsync}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
