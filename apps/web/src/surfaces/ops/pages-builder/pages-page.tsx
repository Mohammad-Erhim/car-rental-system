import {
  DEFAULT_PAGES_CONFIG,
  zBlock,
  zPagesConfig,
  type Block,
  type BlockType,
  type Localized,
  type PagesConfig,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
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

import { useAuth } from '../../../lib/auth.js';
import {
  useDraftPages,
  usePagesTransition,
  usePagesVersions,
  usePublishedPages,
  useUploadPageAsset,
} from '../../../lib/pages-hooks.js';

import { BLOCK_DEFS, BLOCK_ORDER, ICON_OPTIONS, type FieldDef } from './block-defs.js';

const LOCALES = ['en', 'fr', 'ar'] as const;
type EditLocale = (typeof LOCALES)[number];
const SITE_ORIGIN = import.meta.env.VITE_SITE_URL || window.location.origin;

const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const newId = () => Math.random().toString(36).slice(2, 10);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
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
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const published = usePublishedPages();
  const versions = usePagesVersions();
  const draftMut = useDraftPages();
  const transition = usePagesTransition();
  const upload = useUploadPageAsset();

  const [draft, setDraft] = useState<PagesConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const blocks = cfg.pages.home?.blocks ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // adopt the published config once
  useEffect(() => {
    if (published.data && !adopted.current) {
      adopted.current = true;
      if (!draft) setDraft(clone(published.data.config));
    }
  }, [published.data, draft]);

  const issues = useMemo(() => {
    const parsed = zPagesConfig.safeParse(cfg);
    if (parsed.success) {
      if (!blocks.some((b) => b.type === 'search-card' && !b.hidden)) {
        return [t('ops.pages.searchRequired')];
      }
      return [];
    }
    return parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  }, [cfg, blocks, t]);

  function mutate(next: PagesConfig) {
    setDraft(clone(next));
  }
  function setBlocks(nextBlocks: Block[]) {
    mutate({ ...cfg, pages: { ...cfg.pages, home: { blocks: nextBlocks } } });
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
    return (payloadBlocks: Block[], locale: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'carrental:preview:update', v: 1, payload: { blocks: payloadBlocks, locale } },
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
        postPreview(blocks, editLocale);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [blocks, editLocale, postPreview]);
  useEffect(() => {
    if (previewReady.current) postPreview(blocks, editLocale);
  }, [blocks, editLocale, postPreview]);

  async function onUpload(
    purpose: 'heroImage' | 'pageImage',
    file: File,
    onRef: (ref: string, w: number | null, h: number | null) => void,
  ) {
    const res = await upload.mutateAsync({ purpose, file });
    assetUrls.current[res.ref] = res.url;
    onRef(res.ref, res.width, res.height);
  }

  function saveDraft() {
    if (issues.length) return;
    draftMut.mutate(
      { payload: zPagesConfig.parse(cfg), note: note.trim() || undefined },
      { onSuccess: () => versions.refetch() },
    );
  }

  const publishedRev = published.data?.revision ?? 0;
  const iframeWidth = viewport === 'mobile' ? 390 : viewport === 'tablet' ? 768 : undefined;

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

      <div className="grid gap-6 xl:grid-cols-[20rem_1fr_28rem] [&>*]:min-w-0">
        {/* ---- block list ---- */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('ops.pages.blocksPanel')}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> {t('ops.pages.addBlock')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {blocks.map((b, i) => {
              const def = BLOCK_DEFS[b.type];
              return (
                <div
                  key={b.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${
                    b.id === selectedId
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  } ${b.hidden ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 truncate text-start"
                    onClick={() => setSelectedId(b.id)}
                  >
                    <def.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{t(def.label)}</span>
                    {def.required ? <span className="text-xs text-muted-foreground">*</span> : null}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    aria-label={t('ops.pages.moveUp')}
                    onClick={() => move(b.id, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === blocks.length - 1}
                    aria-label={t('ops.pages.moveDown')}
                    onClick={() => move(b.id, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={def.required}
                    aria-label={b.hidden ? t('ops.pages.show') : t('ops.pages.hide')}
                    onClick={() => updateBlock(b.id, (x) => ({ ...x, hidden: !x.hidden }))}
                  >
                    {b.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={def.required}
                    aria-label={t('ops.pages.delete')}
                    onClick={() => setConfirmDelete(b.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ---- inspector ---- */}
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
              {LOCALES.map((l) => (
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
                {BLOCK_DEFS[selected.type].supportsTone ? (
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-muted-foreground">{t('ops.pages.tone')}</span>
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
              </>
            )}
          </CardContent>
        </Card>

        {/* ---- preview + workflow ---- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('ops.pages.preview')}</CardTitle>
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
              <div className="max-w-full overflow-auto rounded-lg border bg-muted/30 p-2">
                <iframe
                  ref={iframeRef}
                  title={t('ops.pages.previewFrameTitle')}
                  src={`${SITE_ORIGIN}/${editLocale}?preview=1`}
                  className="mx-auto block h-[62vh] rounded border-0 bg-background"
                  style={{ width: iframeWidth ? `${iframeWidth}px` : '100%' }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('ops.pages.previewHint')}</p>
            </CardContent>
          </Card>

          <ColoursPanel />

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
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('ops.pages.notePlaceholder')}
                className="min-h-[60px] text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!draft || issues.length > 0 || draftMut.isPending}
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
            <CardContent className="space-y-2">
              {versions.isLoading ? (
                <p className="text-sm text-muted-foreground">…</p>
              ) : !versions.data?.length ? (
                <p className="text-sm text-muted-foreground">{t('ops.pages.noVersions')}</p>
              ) : (
                versions.data.slice(0, 8).map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      r{v.revision}
                      <Badge
                        variant={
                          v.state === 'published'
                            ? 'success'
                            : v.state === 'in_review'
                              ? 'warning'
                              : v.state === 'rejected'
                                ? 'destructive'
                                : 'neutral'
                        }
                      >
                        {v.state}
                      </Badge>
                    </span>
                    <span className="flex gap-1">
                      {v.state === 'draft' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => transition.mutate({ id: v.id, action: 'submit' })}
                        >
                          {t('ops.pages.submit')}
                        </Button>
                      ) : null}
                      {v.state === 'in_review' && canPublish ? (
                        <Button
                          size="sm"
                          onClick={() => transition.mutate({ id: v.id, action: 'approve' })}
                        >
                          {t('ops.pages.approve')}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                ))
              )}
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

/* ---------------------------------------------------------------- colours panel */

function ColoursPanel() {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ops.pages.colours')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t('ops.pages.coloursHint')}</p>
        <Button asChild variant="outline" size="sm">
          <RouterLink to="/config/branding">{t('ops.pages.editColoursLink')}</RouterLink>
        </Button>
      </CardContent>
    </Card>
  );
}
