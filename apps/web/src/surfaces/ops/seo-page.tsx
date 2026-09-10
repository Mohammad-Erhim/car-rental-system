import { useAuth } from '@carrental/client/react';
import { DEFAULT_SEO_CONFIG, seoConfigSchema, type SeoConfig } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@carrental/ui';
import { useEffect, useRef, useState } from 'react';

import {
  useDraftSeo,
  usePublishedSeo,
  useSeoPreview,
  useSeoTransition,
  useSeoVersions,
} from '../../lib/seo-hooks.js';

import { ConfigWorkflowHistory } from './config-workflow-history.js';

/**
 * SCREEN-OPS — SEO configuration (SRS-ADM-006, technical-SEO mandate). Edits the `seo`
 * config-version through the same draft → submit → approve workflow as policy/branding (a
 * different reviewer publishes). `apps/site` reads the published config for every route's
 * title / description / canonical / hreflang / robots / JSON-LD.
 */

type NullableKey =
  | 'ogImageUrl'
  | 'twitterHandle'
  | 'googleSiteVerification'
  | 'bingSiteVerification'
  | 'organizationLogoUrl';

export function SeoPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const published = usePublishedSeo();
  const versions = useSeoVersions();
  const draft = useDraftSeo();
  const preview = useSeoPreview();
  const transition = useSeoTransition();

  const base = published.data?.config ?? DEFAULT_SEO_CONFIG;
  const [form, setForm] = useState<SeoConfig>(base);
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const touched = useRef(false);
  const adopted = useRef(false);

  // Adopt the published config once it loads — but never overwrite edits in progress.
  useEffect(() => {
    if (published.data && !adopted.current && !touched.current) {
      adopted.current = true;
      setForm(published.data.config);
    }
  }, [published.data]);

  const set = <K extends keyof SeoConfig>(key: K, value: SeoConfig[K]) => {
    touched.current = true;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setNullable = (key: NullableKey, value: string) =>
    set(key, (value.trim() === '' ? null : value.trim()) as SeoConfig[NullableKey]);

  async function saveDraft() {
    setMsg(null);
    setIssues([]);
    const parsed = seoConfigSchema.safeParse(form);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      return;
    }
    try {
      await draft.mutateAsync({ payload: parsed.data, note: note.trim() || undefined });
      setNote('');
      setMsg(t('ops.seo.draftSaved'));
      void versions.refetch();
    } catch {
      setMsg(t('ops.seo.draftFail'));
    }
  }

  async function runPreview() {
    setMsg(null);
    const parsed = seoConfigSchema.safeParse(form);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      return;
    }
    setIssues([]);
    await preview.mutateAsync(parsed.data);
  }

  const descLen = form.defaultDescription.length;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.seo.title')} description={t('ops.seo.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.seo.identity')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={t('ops.seo.siteName')} htmlFor="seo-name" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.siteName}
                    onChange={(e) => set('siteName', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('ops.seo.titleTemplate')}
                htmlFor="seo-tpl"
                hint={t('ops.seo.titleTemplateHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.titleTemplate}
                    onChange={(e) => set('titleTemplate', e.target.value)}
                    className="font-mono"
                  />
                )}
              </Field>
              <Field
                label={t('ops.seo.defaultTitle')}
                htmlFor="seo-title"
                required
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.defaultTitle}
                    onChange={(e) => set('defaultTitle', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('ops.seo.defaultDescription')}
                htmlFor="seo-desc"
                required
                hint={t('ops.seo.descriptionHint', { n: descLen })}
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={form.defaultDescription}
                    onChange={(e) => set('defaultDescription', e.target.value)}
                  />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.seo.urlsSocial')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('ops.seo.canonicalBase')}
                htmlFor="seo-canon"
                required
                hint={t('ops.seo.canonicalHint')}
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="url"
                    placeholder="https://example.com"
                    value={form.canonicalBaseUrl}
                    onChange={(e) => set('canonicalBaseUrl', e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('ops.seo.ogImage')} htmlFor="seo-og" hint={t('ops.seo.ogImageHint')}>
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="url"
                    placeholder="https://…/og.png"
                    value={form.ogImageUrl ?? ''}
                    onChange={(e) => setNullable('ogImageUrl', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('ops.seo.twitterHandle')}
                htmlFor="seo-tw"
                hint={t('ops.seo.twitterHint')}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    placeholder="@brand"
                    value={form.twitterHandle ?? ''}
                    onChange={(e) => setNullable('twitterHandle', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('ops.seo.orgLogo')}
                htmlFor="seo-logo"
                hint={t('ops.seo.orgLogoHint')}
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="url"
                    placeholder="https://…/logo.png"
                    value={form.organizationLogoUrl ?? ''}
                    onChange={(e) => setNullable('organizationLogoUrl', e.target.value)}
                  />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.seo.indexing')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={form.indexable}
                  onChange={(e) => set('indexable', e.target.checked)}
                />
                <span>
                  <span className="font-medium">{t('ops.seo.indexable')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('ops.seo.indexableHint')}
                  </span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('ops.seo.googleVerification')}
                  htmlFor="seo-gv"
                  hint={t('ops.seo.verificationHint')}
                >
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.googleSiteVerification ?? ''}
                      onChange={(e) => setNullable('googleSiteVerification', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('ops.seo.bingVerification')} htmlFor="seo-bv">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.bingSiteVerification ?? ''}
                      onChange={(e) => setNullable('bingSiteVerification', e.target.value)}
                    />
                  )}
                </Field>
              </div>
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
              <Field label={t('ops.seo.note')} htmlFor="seo-note" hint={t('ops.cfg.noteHint')}>
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={runPreview} loading={preview.isPending}>
                  {t('ops.seo.preview')}
                </Button>
                <Button onClick={saveDraft} loading={draft.isPending} data-testid="seo-draft">
                  {t('ops.cfg.saveDraft')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    touched.current = false;
                    setForm(base);
                    setIssues([]);
                    setMsg(null);
                  }}
                >
                  {t('ops.seo.reset')}
                </Button>
              </div>
              {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ops.seo.preview')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                {published.data?.revision
                  ? t('ops.seo.publishedRev', { n: published.data.revision })
                  : t('ops.seo.usingDefault')}
              </p>
              {preview.data ? (
                <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                  {preview.data.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{t('ops.seo.previewHint')}</p>
              )}
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
