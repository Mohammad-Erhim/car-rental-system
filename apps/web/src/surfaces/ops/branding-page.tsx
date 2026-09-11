import { useAuth } from '@carrental/client/react';
import type { BrandAssetPurpose } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { BrandConfig } from '@carrental/theme';
import {
  DEFAULT_BRAND_CONFIG,
  FONTS,
  PRESETS,
  RADII,
  brandConfigToVarMaps,
  contrastRatio,
  hexToHslTriple,
  hslTripleToHex,
  validateBrandConfig,
} from '@carrental/theme';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  useToast,
} from '@carrental/ui';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import {
  useBrandingPreview,
  useBrandingTransition,
  useBrandingVersions,
  useDraftBranding,
  usePublishedBranding,
  useUploadBrandAsset,
} from '../../lib/branding-hooks.js';

import { ConfigWorkflowHistory } from './config-workflow-history.js';

/**
 * SCREEN-OPS — Branding & theme (DEC-025). Curated controls → design tokens, versioned through
 * the same draft → submit → approve workflow as policy config (a different reviewer publishes),
 * applied live to the public site and this dashboard with no redeploy.
 */

type Mode = 'light' | 'dark';
const EDITABLE = [
  'primary',
  'accent',
  'ring',
  'background',
  'foreground',
  'card',
  'muted',
  'border',
  'destructive',
  'success',
  'warning',
] as const;
type EditableToken = (typeof EDITABLE)[number];

function readableOn(bg: string): string {
  return contrastRatio('0 0% 100%', bg) >= contrastRatio('0 0% 9%', bg) ? '0 0% 100%' : '0 0% 9%';
}

function setToken(cfg: BrandConfig, mode: Mode, token: EditableToken, triple: string): BrandConfig {
  const next = structuredClone(cfg);
  next.colors[mode][token] = triple;
  const fgKey = `${token}Foreground` as keyof BrandConfig['colors']['light'];
  if (fgKey in next.colors[mode]) next.colors[mode][fgKey] = readableOn(triple);
  return next;
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function BrandingPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const published = usePublishedBranding();
  const versions = useBrandingVersions();
  const draftMut = useDraftBranding();
  const previewMut = useBrandingPreview();
  const transition = useBrandingTransition();
  const uploadAsset = useUploadBrandAsset();

  const [mode, setMode] = useState<Mode>('light');
  const [draft, setDraft] = useState<BrandConfig | null>(null);
  const [uploadingKey, setUploadingKey] = useState<BrandAssetPurpose | null>(null);
  const cfg = draft ?? published.data?.config ?? DEFAULT_BRAND_CONFIG;

  const violations = useMemo(() => validateBrandConfig(cfg), [cfg]);
  const previewVars = brandConfigToVarMaps(cfg)[mode] as unknown as CSSProperties;

  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (p) setDraft(structuredClone(p.config));
  };
  const mutate = (next: BrandConfig) => setDraft(next);
  const assign = <K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) =>
    mutate({ ...structuredClone(cfg), [key]: value });

  async function onUpload(purpose: BrandAssetPurpose, file: File) {
    setUploadingKey(purpose);
    try {
      const res = await uploadAsset.mutateAsync({ purpose, file });
      assign('assets', { ...cfg.assets, [purpose]: res.ref });
    } catch {
      /* surfaced by uploadAsset.isError below */
    } finally {
      setUploadingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ops.branding.title')}
        description={t('ops.branding.subtitle')}
        actions={
          <Badge variant={published.data?.revision ? 'success' : 'neutral'}>
            {published.data?.revision
              ? t('ops.branding.publishedRev', { n: published.data.revision })
              : t('ops.branding.usingDefault')}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.branding.presets')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.id} variant="outline" size="sm" onClick={() => loadPreset(p.id)}>
                  {p.label}
                </Button>
              ))}
              {draft ? (
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {t('action.cancel')}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('ops.branding.colours')}</CardTitle>
              <div className="flex gap-1 rounded-md border p-0.5" role="tablist">
                {(['light', 'dark'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded px-3 py-1 text-sm ${
                      mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {t(`theme.${m}`)}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {EDITABLE.map((token) => {
                const triple = cfg.colors[mode][token];
                return (
                  <Row key={token} label={token}>
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${token} colour`}
                        value={hslTripleToHex(triple)}
                        onChange={(e) => {
                          const tr = hexToHslTriple(e.target.value);
                          if (tr) mutate(setToken(cfg, mode, token, tr));
                        }}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
                      />
                      <Input
                        value={triple}
                        onChange={(e) => mutate(setToken(cfg, mode, token, e.target.value))}
                        className="font-mono text-xs"
                        spellCheck={false}
                      />
                    </span>
                  </Row>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.branding.shape')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Row label={t('ops.branding.radius')}>
                <select
                  className={selectClass}
                  value={cfg.radius}
                  onChange={(e) => assign('radius', e.target.value as BrandConfig['radius'])}
                >
                  {Object.keys(RADII).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t('ops.branding.density')}>
                <select
                  className={selectClass}
                  value={cfg.density}
                  onChange={(e) => assign('density', e.target.value as BrandConfig['density'])}
                >
                  <option value="comfortable">{t('ops.branding.densityComfortable')}</option>
                  <option value="compact">{t('ops.branding.densityCompact')}</option>
                </select>
              </Row>
              <Row label={t('ops.branding.font')}>
                <select
                  className={selectClass}
                  value={cfg.font}
                  onChange={(e) => assign('font', e.target.value as BrandConfig['font'])}
                >
                  {Object.entries(FONTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.branding.assets')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Row label={t('ops.branding.wordmark')}>
                <Input
                  value={cfg.assets.wordmark}
                  onChange={(e) => assign('assets', { ...cfg.assets, wordmark: e.target.value })}
                />
              </Row>
              {(['logo', 'logoDark', 'favicon', 'ogImage'] as const).map((k) => (
                <Row key={k} label={k}>
                  <div className="space-y-1">
                    <Input
                      placeholder="https://…"
                      value={cfg.assets[k] ?? ''}
                      onChange={(e) =>
                        assign('assets', { ...cfg.assets, [k]: e.target.value || null })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer text-xs text-primary underline underline-offset-2">
                        {uploadAsset.isPending && uploadingKey === k
                          ? t('ops.branding.uploading')
                          : t('ops.branding.upload')}
                        <input
                          type="file"
                          accept={
                            k === 'ogImage'
                              ? 'image/png,image/jpeg,image/webp'
                              : k === 'favicon'
                                ? 'image/png,image/x-icon,.ico'
                                : 'image/png,image/jpeg,image/webp,image/svg+xml'
                          }
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onUpload(k, file);
                          }}
                        />
                      </label>
                      {cfg.assets[k]?.startsWith('obj:') ? (
                        <span className="text-xs text-muted-foreground">
                          {t('ops.branding.uploaded')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Row>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {t('ops.branding.assetHint')}
              </p>
              {uploadAsset.isError ? (
                <p className="text-xs text-destructive sm:col-span-2">
                  {(uploadAsset.error as Error).message || t('error.generic')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {draftMut.isError ? (
            <p className="text-sm text-destructive">
              {(draftMut.error as Error).message || t('error.generic')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!draft || violations.length > 0 || draftMut.isPending}
              loading={draftMut.isPending}
              onClick={() =>
                draft &&
                draftMut.mutate(
                  { payload: draft },
                  {
                    onSuccess: () =>
                      toast({ title: t('ops.branding.draftSaved'), variant: 'success' }),
                  },
                )
              }
            >
              {t('ops.branding.saveDraft')}
            </Button>
            <Button
              variant="outline"
              disabled={previewMut.isPending}
              onClick={() => previewMut.mutate(cfg)}
            >
              {t('ops.branding.checkContrast')}
            </Button>
            {previewMut.data ? (
              <span className="text-sm text-muted-foreground">{previewMut.data.examples[0]}</span>
            ) : null}
          </div>
        </div>

        {/* ---- live preview + history ---- */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.branding.preview')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                style={previewVars}
                data-density={cfg.density}
                className={`rounded-lg border p-4 ${mode === 'dark' ? 'dark' : ''}`}
              >
                <div
                  className="p-3"
                  style={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    borderRadius: 'var(--radius)',
                    border: '1px solid hsl(var(--border))',
                  }}
                >
                  <p className="text-sm font-semibold">{cfg.assets.wordmark || 'Car Rental'}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {t('ops.branding.previewBody')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className="px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      Primary
                    </span>
                    <span
                      className="px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: 'hsl(var(--accent))',
                        color: 'hsl(var(--accent-foreground))',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      Accent
                    </span>
                    {(['destructive', 'success', 'warning'] as const).map((s) => (
                      <span
                        key={s}
                        className="px-2 py-1 text-[11px] font-medium capitalize"
                        style={{
                          background: `hsl(var(--${s}) / 0.15)`,
                          color: `hsl(var(--${s}))`,
                          borderRadius: 'calc(var(--radius) - 3px)',
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Public marketing site — hero + CTA + card all derive from --primary. */}
                <div className="mt-3">
                  <p
                    className="mb-1.5 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    {t('ops.branding.publicSitePreview')}
                  </p>
                  <div
                    className="relative overflow-hidden p-4"
                    style={{
                      borderRadius: 'var(--radius)',
                      backgroundImage:
                        'linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary)) 55%, hsl(var(--ring) / 0.8) 100%)',
                      color: 'hsl(var(--primary-foreground))',
                    }}
                  >
                    <p className="text-sm font-bold">{cfg.assets.wordmark || 'Car Rental'}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{t('ops.branding.previewBody')}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          background: 'hsl(var(--primary-foreground))',
                          color: 'hsl(var(--primary))',
                          borderRadius: 'calc(var(--radius) - 3px)',
                        }}
                      >
                        Search
                      </span>
                      <span
                        className="px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          border: '1px solid hsl(var(--primary-foreground) / 0.4)',
                          borderRadius: 'calc(var(--radius) - 3px)',
                        }}
                      >
                        Fleet
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('ops.branding.publicSiteHint')}
              </p>
              <p
                className={`mt-3 text-xs ${violations.length ? 'text-destructive' : 'text-success'}`}
              >
                {violations.length
                  ? t('ops.branding.contrastFail', { n: violations.length })
                  : t('ops.branding.contrastOk')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.branding.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfigWorkflowHistory
                versions={versions.data}
                isLoading={versions.isLoading}
                canPublish={canPublish}
                pending={transition.isPending}
                onAction={transition.mutateAsync}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
