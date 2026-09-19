import { useAuth } from '@carrental/client/react';
import { DEFAULT_CONSENT_CONFIG, pickText, type ConsentConfig } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Cookie, Layers, Pencil, PanelBottom } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConsentSheet } from './consent-sheet';

import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfigHistory } from '@/features/config-workflow/config-history';
import { useDeleteConfigVersion } from '@/lib/admin-hooks';
import { useMetaLocales } from '@/lib/api-hooks';
import { useConsentTransition, useConsentVersions, usePublishedConsent } from '@/lib/consent-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

type Cookie = ConsentConfig['cookieTable'][number];
const getRowId = (r: Cookie) => `${r.name}:${r.provider}`;

/**
 * SCREEN-OPS — Cookie consent. What visitors are asked and what the site declares it sets: banner
 * text and layout, the four categories, and the cookie table on the Cookie Policy page. The page
 * shows what is live, in the language you pick; one sheet edits everything and saves a draft
 * revision that is published directly or after an optional review.
 */
export function ConsentPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(['tab', 'locale'] as const);
  const tab = state.tab === 'history' ? 'history' : 'overview';
  const [editing, setEditing] = useState(false);

  const published = usePublishedConsent();
  const versions = useConsentVersions();
  const transition = useConsentTransition();
  const deleteVersion = useDeleteConfigVersion();
  const metaLocales = useMetaLocales();
  const locales = useMemo(
    () => metaLocales.data?.locales.filter((l) => !l.testOnly).map((l) => l.code) ?? ['en'],
    [metaLocales.data],
  );
  const locale = locales.includes(state.locale) ? state.locale : 'en';
  const cfg = published.data?.config ?? DEFAULT_CONSENT_CONFIG;
  const rev = published.data?.revision ?? 0;
  const catLabel = (id: string) => t(`ops.consent.cat.${id}`);
  const { pageRows, pagination } = useClientPage(cfg.cookieTable, state, update);

  const columns = useMemo<ColumnDef<Cookie, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.consent.col.name'),
        cell: ({ row: { original: r } }) => (
          <span className="bidi-isolate font-mono text-xs font-medium">{r.name}</span>
        ),
      },
      {
        id: 'provider',
        header: t('ops.consent.col.provider'),
        cell: ({ row: { original: r } }) => r.provider,
      },
      {
        id: 'category',
        header: t('site.cookie.table.category'),
        cell: ({ row: { original: r } }) => <Badge variant="outline">{catLabel(r.category)}</Badge>,
      },
      {
        id: 'duration',
        header: t('ops.consent.col.duration'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: r } }) => (
          <span className="text-muted-foreground">{r.duration}</span>
        ),
      },
      {
        id: 'purpose',
        header: t('site.cookie.table.purpose'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: r } }) => (
          <span className="line-clamp-2 max-w-sm text-muted-foreground" dir="auto">
            {pickText(r.purpose, locale)}
          </span>
        ),
      },
    ],

    [t, locale],
  );

  if (published.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.consent.loadFail')}
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
        title={t('ops.consent.title')}
        description={t('ops.consent.subtitle')}
        badge={
          <Badge variant={rev ? 'success' : 'secondary'}>
            {rev ? t('ops.consent.publishedRev', { n: rev }) : t('ops.consent.usingDefault')}
          </Badge>
        }
        actions={
          canPublish ? (
            <Button onClick={() => setEditing(true)} data-testid="consent-edit">
              <Pencil aria-hidden="true" />
              {t('ops.consent.edit')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StateSwitcher
          label={t('ops.consent.title')}
          value={tab}
          onChange={(v) => update({ tab: v === 'overview' ? '' : v })}
          testIdPrefix="consent-tab"
          options={[
            { value: 'overview', label: t('ops.seo.tabOverview') },
            {
              value: 'history',
              label: `${t('ops.consent.history')}${versions.data ? ` (${versions.data.length})` : ''}`,
            },
          ]}
        />
        {tab === 'overview' && locales.length > 1 ? (
          <StateSwitcher
            label={t('ops.tpl.languages')}
            value={locale}
            onChange={(v) => update({ locale: v === 'en' ? '' : v })}
            testIdPrefix="consent-view-locale"
            options={locales.map((l) => ({ value: l, label: l.toUpperCase() }))}
          />
        ) : null}
      </div>

      {tab === 'history' ? (
        <SectionCard title={t('ops.consent.history')} description={t('ops.branding.historyHint2')}>
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
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              icon={PanelBottom}
              title={t('ops.consent.banner')}
              description={t('ops.consent.bannerHint')}
            >
              {cfg.enabled ? (
                <div
                  className="space-y-3 rounded-lg border bg-muted/30 p-4"
                  data-testid="consent-mock"
                >
                  <p className="text-sm font-semibold" dir="auto">
                    {pickText(cfg.text.bannerTitle, locale)}
                  </p>
                  <p className="text-sm text-muted-foreground" dir="auto">
                    {pickText(cfg.text.bannerBody, locale)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md border px-3 py-1.5 text-xs">
                      {t('ops.consent.mock.manage')}
                    </span>
                    {cfg.layout.showRejectAll ? (
                      <span className="rounded-md border px-3 py-1.5 text-xs">
                        {t('ops.consent.mock.reject')}
                      </span>
                    ) : null}
                    <span className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                      {t('ops.consent.mock.accept')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(`ops.consent.layout.${cfg.layout.position}`)} ·{' '}
                    {t('ops.consent.policyLine', { n: cfg.policyVersion })}
                  </p>
                </div>
              ) : (
                <StateView title={t('ops.consent.mock.disabled')} className="py-8" />
              )}
            </SectionCard>

            <SectionCard icon={Layers} title={t('ops.consent.categories')}>
              <ul className="divide-y" data-testid="consent-categories">
                {cfg.categories.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium" dir="auto">
                        {pickText(c.name, locale)}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground" dir="auto">
                        {pickText(c.description, locale)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        c.id === 'necessary'
                          ? 'secondary'
                          : c.shown
                            ? c.defaultOn
                              ? 'default'
                              : 'outline'
                            : 'secondary'
                      }
                    >
                      {c.id === 'necessary'
                        ? t('ops.consent.mock.locked')
                        : !c.shown
                          ? t('ops.consent.hidden')
                          : c.defaultOn
                            ? t('ops.consent.mock.on')
                            : t('ops.consent.mock.off')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <section aria-label={t('ops.consent.cookieTable')} data-testid="consent-cookies">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Cookie className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold">{t('ops.consent.cookieTable')}</h2>
            </div>
            <DataTable
              label={t('ops.consent.cookieTable')}
              columns={columns}
              data={pageRows}
              getRowId={getRowId}
              renderCard={(r) => (
                <div className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="bidi-isolate font-mono text-xs font-medium">{r.name}</span>
                    <Badge variant="outline">{catLabel(r.category)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.provider} · {r.duration}
                  </p>
                  <p className="text-sm text-muted-foreground" dir="auto">
                    {pickText(r.purpose, locale)}
                  </p>
                </div>
              )}
              empty={<StateView icon={Cookie} title={t('ops.consent.noRows')} className="py-10" />}
              pagination={pagination}
            />
          </section>
        </div>
      )}

      {editing ? (
        <ConsentSheet
          base={cfg}
          locales={locales}
          open
          onOpenChange={setEditing}
          onSaved={() => update({ tab: 'history' })}
        />
      ) : null}
    </Page>
  );
}
