import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, MapPin } from 'lucide-react';

import { metaApi } from '../../lib/api.js';

/**
 * SCREEN-CUS-001 (foundation slice). Trip-first hero + a status panel proving the API wiring.
 * The full search control (COMP-CUS-001 / COMP-SH-007) lands in STAGE-002.
 */
export function HomePage() {
  const { t, fmt } = useI18n();
  const build = useQuery({
    queryKey: ['meta', 'build'],
    queryFn: ({ signal }) => metaApi.build(signal),
  });
  const locales = useQuery({
    queryKey: ['meta', 'locales'],
    queryFn: ({ signal }) => metaApi.locales(signal),
  });

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-6 md:p-10">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('app.customer.tagline')}</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Choose your pickup and return location and time to see cars you can actually book.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            Pickup &amp; return location
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <CalendarRange className="size-4" aria-hidden="true" />
            Dates &amp; times
          </div>
          <Button size="lg" disabled title="Trip search arrives in the next stage">
            {t('action.search')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Trip search is delivered in the discovery stage. This page confirms the app ↔ API ↔ DB
          wiring below.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backend connection</CardTitle>
          </CardHeader>
          <CardContent>
            {build.isLoading ? (
              <AppStateView kind="loading" title={t('state.loading.title')} inline />
            ) : build.isError ? (
              <AppStateView
                kind="failure"
                inline
                title={t('state.failure.title')}
                description={t('error.network')}
                primaryAction={{ label: t('action.retry'), onClick: () => build.refetch() }}
              />
            ) : (
              <dl className="space-y-1 text-sm" data-testid="build-info">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Service</dt>
                  <dd className="bidi-isolate font-medium">{build.data?.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="bidi-isolate font-medium">{build.data?.version}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd className="font-medium">{build.data?.nodeEnv}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available languages (from database)</CardTitle>
          </CardHeader>
          <CardContent>
            {locales.isLoading ? (
              <AppStateView kind="loading" title={t('state.loading.title')} inline />
            ) : locales.isError ? (
              <AppStateView
                kind="failure"
                inline
                title={t('state.failure.title')}
                primaryAction={{ label: t('action.retry'), onClick: () => locales.refetch() }}
              />
            ) : (
              <ul className="flex flex-wrap gap-2" data-testid="locale-list">
                {locales.data?.locales.map((l) => (
                  <li key={l.code}>
                    <Badge variant={l.isDefault ? 'default' : 'neutral'}>
                      {l.nativeName}
                      {l.direction === 'rtl' ? ' · RTL' : ''}
                      {l.testOnly ? ' · test' : ''}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t('meta.buildInfo', {
                version: build.data?.version ?? '—',
                builtAt: build.data?.builtAt ? fmt.date(build.data.builtAt) : '—',
              })}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
