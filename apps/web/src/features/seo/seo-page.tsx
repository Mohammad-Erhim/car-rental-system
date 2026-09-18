import { useAuth } from '@carrental/client/react';
import { DEFAULT_SEO_CONFIG } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Globe, Pencil, Search, ShieldCheck, Type } from 'lucide-react';
import { useEffect, useState } from 'react';

import { resultTitle } from './seo-model';
import { SeoSheet } from './seo-sheet';

import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfigHistory } from '@/features/config-workflow/config-history';
import { useDeleteConfigVersion } from '@/lib/admin-hooks';
import { usePublishedSeo, useSeoPreview, useSeoTransition, useSeoVersions } from '@/lib/seo-hooks';
import { useListParams } from '@/lib/use-list-params';

const dash = <span className="text-muted-foreground">—</span>;

/**
 * SCREEN-OPS — SEO configuration (SRS-ADM-006). What the site tells search engines: titles, the
 * description, canonical URLs, social cards and whether it may be indexed. The page shows what is
 * live and how a result would read; changes are edited in a sheet, saved as a draft and published
 * by a different reviewer (the same workflow as branding and policy).
 */
export function SeoPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(['tab'] as const);
  const tab = state.tab === 'history' ? 'history' : 'overview';
  const [editing, setEditing] = useState(false);

  const published = usePublishedSeo();
  const versions = useSeoVersions();
  const transition = useSeoTransition();
  const deleteVersion = useDeleteConfigVersion();
  const preview = useSeoPreview();
  const cfg = published.data?.config ?? DEFAULT_SEO_CONFIG;

  const { mutate } = preview;
  useEffect(() => {
    if (published.data) mutate(published.data.config);
  }, [published.data, mutate]);

  if (published.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.seo.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void published.refetch()}
        />
      </Page>
    );
  }
  if (published.isLoading) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-80 rounded-xl" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={t('ops.seo.title')}
        description={t('ops.seo.subtitle')}
        badge={
          <Badge variant={published.data?.revision ? 'success' : 'secondary'}>
            {published.data?.revision
              ? t('ops.seo.publishedRev', { n: published.data.revision })
              : t('ops.seo.usingDefault')}
          </Badge>
        }
        actions={
          canPublish ? (
            <Button onClick={() => setEditing(true)} data-testid="seo-edit">
              <Pencil aria-hidden="true" />
              {t('ops.seo.edit')}
            </Button>
          ) : null
        }
      />

      <StateSwitcher
        label={t('ops.seo.title')}
        value={tab}
        onChange={(v) => update({ tab: v === 'overview' ? '' : v })}
        testIdPrefix="seo-tab"
        options={[
          { value: 'overview', label: t('ops.seo.tabOverview') },
          {
            value: 'history',
            label: `${t('ops.branding.history')}${versions.data ? ` (${versions.data.length})` : ''}`,
          },
        ]}
      />

      {tab === 'history' ? (
        <SectionCard title={t('ops.branding.history')} description={t('ops.branding.historyHint')}>
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
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={Search}
            title={t('ops.seo.resultPreview')}
            description={t('ops.seo.resultPreviewHint')}
          >
            <div className="space-y-1 rounded-lg border bg-background p-4" data-testid="seo-serp">
              <p className="bidi-isolate truncate text-xs text-muted-foreground">
                {cfg.canonicalBaseUrl}
              </p>
              <p className="text-lg leading-snug text-primary">{resultTitle(cfg)}</p>
              <p className="line-clamp-3 text-sm text-muted-foreground">{cfg.defaultDescription}</p>
            </div>
            {preview.data?.examples.length ? (
              <ul className="mt-4 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {preview.data.examples.map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title={t('ops.seo.indexing')}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant={cfg.indexable ? 'success' : 'destructive'}
                  data-testid="seo-indexable-badge"
                >
                  {t(cfg.indexable ? 'ops.seo.indexOn' : 'ops.seo.indexOff')}
                </Badge>
                <span className="text-sm text-muted-foreground">{t('ops.seo.indexableHint')}</span>
              </div>
              <DetailList
                className="sm:grid-cols-1 xl:grid-cols-1"
                items={[
                  {
                    term: t('ops.seo.googleVerification'),
                    detail: cfg.googleSiteVerification || dash,
                  },
                  { term: t('ops.seo.bingVerification'), detail: cfg.bingSiteVerification || dash },
                ]}
              />
            </div>
          </SectionCard>

          <SectionCard icon={Type} title={t('ops.seo.identity')}>
            <DetailList
              className="sm:grid-cols-1 xl:grid-cols-1"
              items={[
                { term: t('ops.seo.siteName'), detail: cfg.siteName },
                {
                  term: t('ops.seo.titleTemplate'),
                  detail: (
                    <span className="bidi-isolate font-mono text-xs">
                      {cfg.titleTemplate || '—'}
                    </span>
                  ),
                },
                { term: t('ops.seo.defaultTitle'), detail: cfg.defaultTitle },
              ]}
            />
          </SectionCard>

          <SectionCard icon={Globe} title={t('ops.seo.urlsSocial')}>
            <DetailList
              className="sm:grid-cols-1 xl:grid-cols-1"
              items={[
                {
                  term: t('ops.seo.canonicalBase'),
                  detail: <span className="bidi-isolate break-all">{cfg.canonicalBaseUrl}</span>,
                },
                {
                  term: t('ops.seo.ogImage'),
                  detail: cfg.ogImageUrl ? (
                    <span className="bidi-isolate break-all">{cfg.ogImageUrl}</span>
                  ) : (
                    dash
                  ),
                },
                { term: t('ops.seo.twitterHandle'), detail: cfg.twitterHandle || dash },
                {
                  term: t('ops.seo.orgLogo'),
                  detail: cfg.organizationLogoUrl ? (
                    <span className="bidi-isolate break-all">{cfg.organizationLogoUrl}</span>
                  ) : (
                    dash
                  ),
                },
              ]}
            />
          </SectionCard>
        </div>
      )}

      {editing ? (
        <SeoSheet
          base={cfg}
          open
          onOpenChange={setEditing}
          onSaved={() => update({ tab: 'history' })}
        />
      ) : null}
    </Page>
  );
}
