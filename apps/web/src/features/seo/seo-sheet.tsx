import type { SeoConfig } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { fieldIssues, seoValues, toSeoConfig, type SeoValues } from './seo-model';

import { CheckField, TextareaField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { useDraftSeo } from '@/lib/seo-hooks';

/**
 * Edit the site's SEO settings and save them as a draft revision (a different reviewer publishes
 * it). Fields are checked with the same schema the API uses, so a bad URL or handle is caught here
 * with the field it belongs to.
 */
export function SeoSheet({
  base,
  open,
  onOpenChange,
  onSaved,
}: {
  base: SeoConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const draft = useDraftSeo();

  const schema = useMemo(
    () =>
      z
        .object({
          siteName: z.string(),
          titleTemplate: z.string(),
          defaultTitle: z.string(),
          defaultDescription: z.string(),
          canonicalBaseUrl: z.string(),
          ogImageUrl: z.string(),
          twitterHandle: z.string(),
          organizationLogoUrl: z.string(),
          indexable: z.boolean(),
          googleSiteVerification: z.string(),
          bingSiteVerification: z.string(),
          note: z.string(),
        })
        .superRefine((v, ctx) => {
          const parsed = toSeoConfig(v);
          if (parsed.success) return;
          for (const [path, message] of Object.entries(fieldIssues(parsed.error))) {
            ctx.addIssue({ code: 'custom', path: [path], message });
          }
        }),
    [],
  );
  const defaults = seoValues(base);
  const form = useForm<SeoValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const descLen = form.watch('defaultDescription').length;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={t('ops.seo.editTitle')}
      description={t('ops.seo.sheetHint')}
      submitLabel={t('ops.cfg.saveDraft')}
      onSubmit={async (v) => {
        const parsed = toSeoConfig(v);
        if (!parsed.success) throw new Error(t('ops.seo.draftFail'));
        await draft.mutateAsync({ payload: parsed.data, note: v.note.trim() || undefined });
        toast.success(t('ops.seo.draftSaved2'));
        onSaved();
      }}
    >
      <FormSection title={t('ops.seo.identity')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="siteName"
            label={t('ops.seo.siteName')}
            autoFocus
            data-testid="seo-site-name"
          />
          <TextField
            control={form.control}
            name="titleTemplate"
            label={t('ops.seo.titleTemplate')}
            description={t('ops.seo.titleTemplateHint')}
            className="[&_input]:font-mono"
          />
        </div>
        <TextField control={form.control} name="defaultTitle" label={t('ops.seo.defaultTitle')} />
        <TextareaField
          control={form.control}
          name="defaultDescription"
          label={t('ops.seo.defaultDescription')}
          description={t('ops.seo.descriptionHint', { n: descLen })}
          rows={3}
        />
      </FormSection>

      <FormSection title={t('ops.seo.urlsSocial')}>
        <TextField
          control={form.control}
          name="canonicalBaseUrl"
          label={t('ops.seo.canonicalBase')}
          description={t('ops.seo.canonicalHint')}
          inputMode="url"
          placeholder="https://example.com"
          data-testid="seo-canonical"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="ogImageUrl"
            label={t('ops.seo.ogImage')}
            description={t('ops.seo.ogImageHint')}
            inputMode="url"
            placeholder="https://…/og.png"
          />
          <TextField
            control={form.control}
            name="twitterHandle"
            label={t('ops.seo.twitterHandle')}
            description={t('ops.seo.twitterHint')}
            placeholder="@brand"
            data-testid="seo-twitter"
          />
        </div>
        <TextField
          control={form.control}
          name="organizationLogoUrl"
          label={t('ops.seo.orgLogo')}
          description={t('ops.seo.orgLogoHint')}
          inputMode="url"
          placeholder="https://…/logo.png"
        />
      </FormSection>

      <FormSection title={t('ops.seo.indexing')}>
        <CheckField
          control={form.control}
          name="indexable"
          label={t('ops.seo.indexable')}
          description={t('ops.seo.indexableHint')}
          variant="switch"
          testId="seo-indexable"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="googleSiteVerification"
            label={t('ops.seo.googleVerification')}
            description={t('ops.seo.verificationHint')}
          />
          <TextField
            control={form.control}
            name="bingSiteVerification"
            label={t('ops.seo.bingVerification')}
          />
        </div>
      </FormSection>

      <FormSection title={t('ops.seo.note')}>
        <TextareaField
          control={form.control}
          name="note"
          label={t('ops.seo.note')}
          description={t('ops.cfg.noteHint')}
          rows={2}
        />
      </FormSection>
    </FormSheet>
  );
}
