import { useAuth } from '@carrental/client/react';
import type { BrandAssetPurpose } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { BrandConfig } from '@carrental/theme';
import {
  DEFAULT_BRAND_CONFIG,
  FONTS,
  PRESETS,
  RADII,
  hexToHslTriple,
  hslTripleToHex,
  validateBrandConfig,
} from '@carrental/theme';
import { CheckCircle2, Loader2, ShieldAlert, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BrandPreview } from './brand-preview';
import {
  acceptFor,
  ASSET_KEYS,
  EDITABLE,
  setToken,
  type EditableToken,
  type Mode,
} from './branding-model';

import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  useBrandingPreview,
  useBrandingTransition,
  useBrandingVersions,
  useDraftBranding,
  usePublishedBranding,
  useUploadBrandAsset,
} from '@/lib/branding-hooks';
import { useListParams } from '@/lib/use-list-params';
import { cn } from '@/lib/utils';

/**
 * SCREEN-OPS — Branding & theme (DEC-025). Curated controls become design tokens, versioned through
 * the same draft → submit → approve workflow as every config (published directly or after an optional review) and
 * applied live to the public site and this dashboard with no redeploy. The controls sit beside a
 * live preview, so this is a workspace rather than a list with a form in a modal.
 */
export function BrandingPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(['tab'] as const);
  const tab = state.tab === 'history' ? 'history' : 'theme';

  const published = usePublishedBranding();
  const versions = useBrandingVersions();
  const draftMut = useDraftBranding();
  const previewMut = useBrandingPreview();
  const transition = useBrandingTransition();
  const uploadAsset = useUploadBrandAsset();
  const deleteVersion = useDeleteConfigVersion();

  const [mode, setMode] = useState<Mode>('light');
  const [draft, setDraft] = useState<BrandConfig | null>(null);
  const [uploadingKey, setUploadingKey] = useState<BrandAssetPurpose | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const cfg = draft ?? published.data?.config ?? DEFAULT_BRAND_CONFIG;
  const violations = useMemo(() => validateBrandConfig(cfg), [cfg]);
  const assign = <K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) =>
    setDraft({ ...structuredClone(cfg), [key]: value });

  async function onUpload(purpose: BrandAssetPurpose, file: File) {
    setUploadingKey(purpose);
    setUploadError(null);
    try {
      const res = await uploadAsset.mutateAsync({ purpose, file });
      assign('assets', { ...cfg.assets, [purpose]: res.ref });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setUploadingKey(null);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    try {
      await draftMut.mutateAsync({ payload: draft });
      toast.success(t('ops.branding.draftSaved'));
      setDraft(null);
      update({ tab: 'history' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error.generic'));
    }
  }

  // Without this gate `cfg` falls back to the built-in default for one render — a flash of the
  // wrong colours on every load for an org whose real theme differs.
  if (published.isLoading) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 rounded-xl" />
      </Page>
    );
  }
  if (published.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.branding.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void published.refetch()}
        />
      </Page>
    );
  }

  const disabled = !canPublish;

  return (
    <Page>
      <PageHeader
        title={t('ops.branding.title')}
        description={t('ops.branding.subtitle')}
        badge={
          <Badge variant={published.data?.revision ? 'success' : 'secondary'}>
            {published.data?.revision
              ? t('ops.branding.publishedRev', { n: published.data.revision })
              : t('ops.branding.usingDefault')}
          </Badge>
        }
        actions={
          canPublish && draft ? (
            <>
              <Button variant="outline" onClick={() => setDraft(null)}>
                {t('ops.branding.discard')}
              </Button>
              <Button
                onClick={() => void saveDraft()}
                disabled={violations.length > 0}
                loading={draftMut.isPending}
                data-testid="branding-save"
              >
                {t('ops.branding.saveDraft')}
              </Button>
            </>
          ) : null
        }
      />

      <StateSwitcher
        label={t('ops.branding.title')}
        value={tab}
        onChange={(v) => update({ tab: v === 'theme' ? '' : v })}
        testIdPrefix="branding-tab"
        options={[
          { value: 'theme', label: t('ops.branding.tabTheme') },
          {
            value: 'history',
            label: `${t('ops.branding.history')}${versions.data ? ` (${versions.data.length})` : ''}`,
          },
        ]}
      />

      {tab === 'history' ? (
        <SectionCard title={t('ops.branding.history')} description={t('ops.branding.historyHint2')}>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="space-y-6">
            {draft ? (
              <Alert variant="info">
                <AlertDescription>{t('ops.branding.unsaved')}</AlertDescription>
              </Alert>
            ) : null}

            <SectionCard title={t('ops.branding.presets')}>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setDraft(structuredClone(p.config))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title={t('ops.branding.colours')}
              actions={
                <StateSwitcher
                  label={t('ops.branding.colours')}
                  value={mode}
                  onChange={(v) => setMode(v as Mode)}
                  testIdPrefix="branding-mode"
                  options={[
                    { value: 'light', label: t('theme.light') },
                    { value: 'dark', label: t('theme.dark') },
                  ]}
                />
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {EDITABLE.map((token: EditableToken) => {
                  const triple = cfg.colors[mode][token];
                  return (
                    <div key={token} className="space-y-1.5">
                      <Label htmlFor={`tok-${token}`} className="capitalize">
                        {token}
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${token} colour`}
                          value={hslTripleToHex(triple)}
                          disabled={disabled}
                          onChange={(e) => {
                            const tr = hexToHslTriple(e.target.value);
                            if (tr) setDraft(setToken(cfg, mode, token, tr));
                          }}
                          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <Input
                          id={`tok-${token}`}
                          value={triple}
                          disabled={disabled}
                          onChange={(e) => setDraft(setToken(cfg, mode, token, e.target.value))}
                          className="font-mono text-xs"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title={t('ops.branding.shape')}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{t('ops.branding.radius')}</Label>
                  <Select
                    value={cfg.radius}
                    disabled={disabled}
                    onValueChange={(v) => assign('radius', v as BrandConfig['radius'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(RADII).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('ops.branding.density')}</Label>
                  <Select
                    value={cfg.density}
                    disabled={disabled}
                    onValueChange={(v) => assign('density', v as BrandConfig['density'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">
                        {t('ops.branding.densityComfortable')}
                      </SelectItem>
                      <SelectItem value="compact">{t('ops.branding.densityCompact')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('ops.branding.font')}</Label>
                  <Select
                    value={cfg.font}
                    disabled={disabled}
                    onValueChange={(v) => assign('font', v as BrandConfig['font'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FONTS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('ops.branding.assets')} description={t('ops.branding.assetHint')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="asset-wordmark">{t('ops.branding.wordmark')}</Label>
                  <Input
                    id="asset-wordmark"
                    value={cfg.assets.wordmark}
                    disabled={disabled}
                    onChange={(e) => assign('assets', { ...cfg.assets, wordmark: e.target.value })}
                  />
                </div>
                {ASSET_KEYS.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`asset-${k}`}>{t(`ops.branding.asset.${k}`)}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`asset-${k}`}
                        placeholder="https://…"
                        value={cfg.assets[k] ?? ''}
                        disabled={disabled}
                        onChange={(e) =>
                          assign('assets', { ...cfg.assets, [k]: e.target.value || null })
                        }
                      />
                      <label
                        title={t('ops.branding.upload')}
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'icon' }),
                          'shrink-0 cursor-pointer',
                          (disabled || uploadingKey === k) && 'pointer-events-none opacity-50',
                        )}
                      >
                        {uploadingKey === k ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                        <span className="sr-only">{t('ops.branding.upload')}</span>
                        <input
                          type="file"
                          disabled={disabled}
                          accept={acceptFor(k)}
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void onUpload(k, file);
                          }}
                        />
                      </label>
                    </div>
                    {cfg.assets[k]?.startsWith('obj:') ? (
                      <p className="text-xs text-muted-foreground">{t('ops.branding.uploaded')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              {uploadError ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {uploadError}
                </p>
              ) : null}
            </SectionCard>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SectionCard
              title={t('ops.branding.preview')}
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  loading={previewMut.isPending}
                  onClick={() => previewMut.mutate(cfg)}
                >
                  {t('ops.branding.checkContrast')}
                </Button>
              }
            >
              <div className="space-y-3">
                <BrandPreview config={cfg} mode={mode} />
                <p className="text-xs text-muted-foreground">{t('ops.branding.publicSiteHint')}</p>
                {violations.length ? (
                  <Alert variant="destructive">
                    <ShieldAlert aria-hidden="true" />
                    <AlertDescription>
                      {t('ops.branding.contrastFail', { n: violations.length })}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-success">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {t('ops.branding.contrastOk')}
                  </p>
                )}
                {previewMut.data ? (
                  <p className="text-xs text-muted-foreground">{previewMut.data.examples[0]}</p>
                ) : null}
              </div>
            </SectionCard>
          </aside>
        </div>
      )}
    </Page>
  );
}
