import { useAuth } from '@carrental/client/react';
import {
  CONSENT_CATEGORIES,
  DEFAULT_CONSENT_CONFIG,
  pickText,
  zConsentConfig,
  type ConsentCategory,
  type ConsentConfig,
  type Localized,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  PageHeader,
  Textarea,
} from '@carrental/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  useConsentPreview,
  useConsentTransition,
  useConsentVersions,
  useDraftConsent,
  usePublishedConsent,
} from '../../../lib/consent-hooks.js';
import { ConfigWorkflowHistory } from '../config-workflow-history.js';

const LOCALES = ['en', 'fr', 'ar'] as const;
type EditLocale = (typeof LOCALES)[number];
const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function LText({
  value,
  locale,
  onChange,
  label,
  area,
  max,
}: {
  value: Localized | undefined;
  locale: EditLocale;
  onChange: (v: Localized) => void;
  label: string;
  area?: boolean;
  max?: number;
}) {
  const lv: Localized = value ?? { en: '' };
  const cur = (lv as Record<string, string | undefined>)[locale] ?? '';
  const set = (s: string) =>
    onChange({ ...lv, [locale]: locale === 'en' ? s : s || undefined } as Localized);
  const C = area ? Textarea : Input;
  return (
    <C
      value={cur}
      maxLength={max}
      aria-label={label}
      placeholder={locale !== 'en' ? lv.en : ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
        set(e.target.value)
      }
      className={area ? 'min-h-[64px] text-sm' : undefined}
    />
  );
}

export function ConsentPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const published = usePublishedConsent();
  const versions = useConsentVersions();
  const draftMut = useDraftConsent();
  const preview = useConsentPreview();
  const transition = useConsentTransition();

  const [cfg, setCfg] = useState<ConsentConfig>(DEFAULT_CONSENT_CONFIG);
  const [editLocale, setEditLocale] = useState<EditLocale>('en');
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const adopted = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    if (published.data && !adopted.current && !touched.current) {
      adopted.current = true;
      setCfg(clone(published.data.config));
    }
  }, [published.data]);

  const patch = (p: Partial<ConsentConfig>) => {
    touched.current = true;
    setCfg((c) => ({ ...c, ...p }));
  };
  const patchCategory = (id: ConsentCategory, p: Partial<ConsentConfig['categories'][number]>) => {
    touched.current = true;
    setCfg((c) => ({
      ...c,
      categories: c.categories.map((cat) => (cat.id === id ? { ...cat, ...p } : cat)),
    }));
  };
  const patchCookie = (i: number, p: Partial<ConsentConfig['cookieTable'][number]>) => {
    touched.current = true;
    setCfg((c) => ({
      ...c,
      cookieTable: c.cookieTable.map((row, j) => (j === i ? { ...row, ...p } : row)),
    }));
  };

  function validated(): ConsentConfig | null {
    const parsed = zConsentConfig.safeParse(cfg);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      return null;
    }
    setIssues([]);
    return parsed.data;
  }

  async function saveDraft() {
    setMsg(null);
    const payload = validated();
    if (!payload) return;
    try {
      await draftMut.mutateAsync({ payload, note: note.trim() || undefined });
      setNote('');
      setMsg(t('ops.consent.draftSaved'));
      void versions.refetch();
    } catch {
      setMsg(t('ops.consent.draftFail'));
    }
  }
  async function runPreview() {
    setMsg(null);
    const payload = validated();
    if (payload) await preview.mutateAsync(payload);
  }

  const publishedRev = published.data?.revision ?? 0;
  const catLabel = (id: ConsentCategory) => t(`ops.consent.cat.${id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ops.consent.title')}
        description={t('ops.consent.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={publishedRev ? 'success' : 'neutral'}>
              {publishedRev
                ? t('ops.consent.publishedRev', { n: publishedRev })
                : t('ops.consent.usingDefault')}
            </Badge>
            <div className="flex gap-1 rounded-md border p-0.5" role="tablist">
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
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-6">
          {/* banner */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('ops.consent.banner')}</CardTitle>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={cfg.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
                {t('ops.consent.enabled')}
              </label>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {t('ops.consent.policyVersion')}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    aria-label={t('ops.consent.policyVersion')}
                    value={cfg.policyVersion}
                    onChange={(e) =>
                      patch({ policyVersion: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <span className="text-[0.7rem] text-muted-foreground">
                    {t('ops.consent.policyVersionHint')}
                  </span>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {t('ops.consent.layout')}
                  </span>
                  <select
                    className={selectClass}
                    aria-label={t('ops.consent.layout')}
                    value={cfg.layout.position}
                    onChange={(e) =>
                      patch({
                        layout: {
                          ...cfg.layout,
                          position: e.target.value as ConsentConfig['layout']['position'],
                        },
                      })
                    }
                  >
                    <option value="bar">{t('ops.consent.layout.bar')}</option>
                    <option value="card">{t('ops.consent.layout.card')}</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cfg.layout.showRejectAll}
                  onChange={(e) =>
                    patch({ layout: { ...cfg.layout, showRejectAll: e.target.checked } })
                  }
                />
                <span className="font-medium text-muted-foreground">
                  {t('ops.consent.showRejectAll')}
                </span>
              </label>
              {editLocale !== 'en' ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {t('ops.consent.localeFallbackHint')}
                </p>
              ) : null}
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.consent.bannerTitle')}
                </span>
                <LText
                  value={cfg.text.bannerTitle}
                  label={t('ops.consent.bannerTitle')}
                  locale={editLocale}
                  max={120}
                  onChange={(v) => patch({ text: { ...cfg.text, bannerTitle: v } })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.consent.bannerBody')}
                </span>
                <LText
                  value={cfg.text.bannerBody}
                  label={t('ops.consent.bannerBody')}
                  locale={editLocale}
                  area
                  max={600}
                  onChange={(v) => patch({ text: { ...cfg.text, bannerBody: v } })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.consent.prefsIntro')}
                </span>
                <LText
                  value={cfg.text.prefsIntro}
                  label={t('ops.consent.prefsIntro')}
                  locale={editLocale}
                  area
                  max={600}
                  onChange={(v) => patch({ text: { ...cfg.text, prefsIntro: v } })}
                />
              </label>
            </CardContent>
          </Card>

          {/* categories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.consent.categories')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONSENT_CATEGORIES.map((id) => {
                const cat = cfg.categories.find((c) => c.id === id);
                if (!cat) return null;
                const locked = id === 'necessary';
                return (
                  <div key={id} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{catLabel(id)}</span>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-1.5">
                          <Checkbox
                            checked={locked ? true : cat.shown}
                            disabled={locked}
                            onChange={(e) => patchCategory(id, { shown: e.target.checked })}
                          />
                          {t('ops.consent.shown')}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <Checkbox
                            checked={locked ? true : cat.defaultOn}
                            disabled={locked}
                            onChange={(e) => patchCategory(id, { defaultOn: e.target.checked })}
                          />
                          {t('ops.consent.defaultOn')}
                        </label>
                      </div>
                    </div>
                    <LText
                      value={cat.name}
                      label={`${catLabel(id)} — ${t('ops.consent.bannerTitle')}`}
                      locale={editLocale}
                      max={60}
                      onChange={(v) => patchCategory(id, { name: v })}
                    />
                    <LText
                      value={cat.description}
                      label={`${catLabel(id)} — ${t('ops.consent.bannerBody')}`}
                      locale={editLocale}
                      area
                      max={400}
                      onChange={(v) => patchCategory(id, { description: v })}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* cookie declaration */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('ops.consent.cookieTable')}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch({
                    cookieTable: [
                      ...cfg.cookieTable,
                      {
                        name: '',
                        provider: '',
                        category: 'necessary',
                        purpose: { en: '' },
                        duration: '',
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" /> {t('ops.consent.addRow')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!cfg.cookieTable.length ? (
                <p className="text-sm text-muted-foreground">{t('ops.consent.noRows')}</p>
              ) : null}
              {cfg.cookieTable.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label={t('ops.consent.removeRow')}
                      onClick={() =>
                        patch({ cookieTable: cfg.cookieTable.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={row.name}
                      aria-label={t('ops.consent.col.name')}
                      placeholder={t('ops.consent.col.name')}
                      onChange={(e) => patchCookie(i, { name: e.target.value })}
                    />
                    <Input
                      value={row.provider}
                      aria-label={t('ops.consent.col.provider')}
                      placeholder={t('ops.consent.col.provider')}
                      onChange={(e) => patchCookie(i, { provider: e.target.value })}
                    />
                    <select
                      className={selectClass}
                      aria-label={t('site.cookie.table.category')}
                      value={row.category}
                      onChange={(e) =>
                        patchCookie(i, { category: e.target.value as ConsentCategory })
                      }
                    >
                      {CONSENT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {catLabel(c)}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={row.duration}
                      aria-label={t('ops.consent.col.duration')}
                      placeholder={t('ops.consent.col.duration')}
                      onChange={(e) => patchCookie(i, { duration: e.target.value })}
                    />
                  </div>
                  <LText
                    value={row.purpose}
                    label={t('site.cookie.table.purpose')}
                    locale={editLocale}
                    max={200}
                    onChange={(v) => patchCookie(i, { purpose: v })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              {issues.length ? (
                <ul className="list-disc space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 ps-7 text-sm text-destructive">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
              <Textarea
                value={note}
                aria-label={t('ops.consent.notePlaceholder')}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('ops.consent.notePlaceholder')}
                className="min-h-[52px] text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={runPreview} loading={preview.isPending}>
                  {t('ops.consent.preview')}
                </Button>
                <Button onClick={saveDraft} loading={draftMut.isPending}>
                  {t('ops.consent.saveDraft')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    touched.current = false;
                    setCfg(clone(published.data?.config ?? DEFAULT_CONSENT_CONFIG));
                    setIssues([]);
                    setMsg(null);
                  }}
                >
                  {t('ops.consent.reset')}
                </Button>
              </div>
              {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.consent.previewTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cfg.enabled ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    {pickText(cfg.text.bannerTitle, editLocale)}
                  </p>
                  <p className="mt-1 text-xs">{pickText(cfg.text.bannerBody, editLocale)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded border px-2 py-0.5 text-[0.7rem]">
                      {t('ops.consent.mock.manage')}
                    </span>
                    {cfg.layout.showRejectAll ? (
                      <span className="rounded border px-2 py-0.5 text-[0.7rem]">
                        {t('ops.consent.mock.reject')}
                      </span>
                    ) : null}
                    <span className="rounded bg-primary px-2 py-0.5 text-[0.7rem] text-primary-foreground">
                      {t('ops.consent.mock.accept')}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 border-t pt-2 text-[0.7rem] text-muted-foreground">
                    {cfg.categories
                      .filter((c) => c.id === 'necessary' || c.shown)
                      .map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span>{pickText(c.name, editLocale)}</span>
                          <span>
                            {c.id === 'necessary'
                              ? t('ops.consent.mock.locked')
                              : c.defaultOn
                                ? t('ops.consent.mock.on')
                                : t('ops.consent.mock.off')}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('ops.consent.mock.disabled')}</p>
              )}
              {preview.data ? (
                <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
                  {preview.data.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.consent.history')}</CardTitle>
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
