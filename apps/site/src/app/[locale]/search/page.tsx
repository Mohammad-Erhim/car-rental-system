import { AlertCircle, ArrowRight, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HomeSearch, type LocationOption } from '../../../components/home-search';
import { CarArt, carVariantFor } from '../../../components/marketing/art';
import { SiteContainer } from '../../../components/site-container';
import { apiGet, apiPost } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

/** Shape returned by `POST /api/v1/discovery/search` (SearchResult.options). */
interface Option {
  categoryCode: string;
  categoryName: string;
  bookableCount: number;
  fromTotalMinor?: number | null;
  currency?: string | null;
}
interface Notice {
  code: string;
  message: string;
  field?: string;
}
interface SearchResponse {
  options: Option[];
  currency?: string;
  state?: string;
  notices?: Notice[];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/search',
    title: `${t.t('site.search.title')} — ${t.t('app.name')}`,
    description: t.t('site.search.metaDescription'),
  });
}

function money(minor: number, currency: string, locale: string) {
  if (!Number.isFinite(minor)) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Localised copy for a discovery-search notice; falls back to the API's own message. */
function noticeText(t: (k: string, p?: Record<string, unknown>) => string, n: Notice): string {
  if (n.code.startsWith('pickup_')) return t('site.search.notice.pickupClosed');
  if (n.code.startsWith('return_')) return t('site.search.notice.returnClosed');
  if (n.code === 'past_pickup') return t('site.search.notice.pastPickup');
  if (n.code === 'invalid_window') return t('search.errOrder');
  return n.message;
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { locale } = params;
  const t = await getT(locale);
  const pickup = typeof searchParams.pickup === 'string' ? searchParams.pickup : '';
  const pickupAt = typeof searchParams.pickupAt === 'string' ? searchParams.pickupAt : '';
  const returnAt = typeof searchParams.returnAt === 'string' ? searchParams.returnAt : '';

  const locations = await apiGet<Array<{ code: string; name: string }>>('/config/locations', {
    revalidate: 300,
  })
    .then((rows) => rows.map((r): LocationOption => ({ code: r.code, name: r.name })))
    .catch(() => [] as LocationOption[]);

  let data: SearchResponse | null = null;
  let failure: 'badLocation' | 'generic' | null = null;
  if (pickup && pickupAt && returnAt) {
    try {
      data = await apiPost<SearchResponse>('/discovery/search', {
        pickupLocationCode: pickup,
        pickupAt,
        returnAt,
      });
    } catch (e) {
      const status = (e as { status?: number }).status;
      failure = status === 404 ? 'badLocation' : 'generic';
    }
  }

  const notices = data?.notices ?? [];
  const options = data?.options ?? [];
  const hasOptions = options.length > 0;
  const hasBookable = options.some(
    (o) => o.bookableCount > 0 && typeof o.fromTotalMinor === 'number',
  );
  const searched = Boolean(pickup && pickupAt && returnAt);
  const showNoResults = searched && !failure && !hasBookable;

  return (
    <SiteContainer className="space-y-8">
      <header className="space-y-2">
        <span className="eyebrow">{t.t('site.search.heroEyebrow')}</span>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t.t('site.search.title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-muted sm:text-base">{t.t('site.search.lead')}</p>
      </header>

      <div className="surface-card rounded-2xl p-4 sm:p-6">
        <HomeSearch
          locale={locale}
          locations={locations}
          initialPickup={pickup}
          initialPickupAt={pickupAt || undefined}
          initialReturnAt={returnAt || undefined}
        />
      </div>

      {!searched ? (
        <p className="text-sm text-ink-muted">{t.t('site.search.noQuery')}</p>
      ) : (
        <p className="text-sm font-medium text-ink-muted">
          {t.t('site.search.summary', { location: pickup })}
        </p>
      )}

      {failure === 'badLocation' ? (
        <p className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {t.t('site.search.badLocation')}
        </p>
      ) : failure === 'generic' ? (
        <p className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {t.t('error.generic')}
        </p>
      ) : null}

      {notices.length ? (
        <ul className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
          {notices.map((n) => (
            <li key={n.code} className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {noticeText(t.t, n)}
            </li>
          ))}
        </ul>
      ) : null}

      {showNoResults ? (
        <div
          data-appstate="no-results"
          className="rounded-2xl border border-dashed border-hairline bg-surface-muted p-8 text-center"
        >
          <p className="font-semibold text-ink">{t.t('site.search.noResults')}</p>
        </div>
      ) : null}

      {hasOptions ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">{t.t('site.search.resultsTitle')}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="results-list">
            {options.map((o) => {
              const soldOut = o.bookableCount < 1;
              return (
                <li
                  key={o.categoryCode}
                  data-testid={`result-${o.categoryCode}`}
                  data-soldout={soldOut}
                  className="flex h-full flex-col overflow-hidden surface-card hover-lift"
                >
                  <div className="relative flex aspect-[16/9] items-end justify-center overflow-hidden bg-brand-gradient">
                    <span className="dot-grid absolute inset-0 opacity-20" aria-hidden="true" />
                    <CarArt
                      variant={carVariantFor(o.categoryCode)}
                      className="art-shadow w-[76%] text-on-brand"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-ink">{o.categoryName}</h3>
                      {typeof o.fromTotalMinor === 'number' && o.currency ? (
                        <p
                          className="whitespace-nowrap text-end text-sm font-bold text-ink"
                          data-testid={`result-${o.categoryCode}-price`}
                        >
                          {money(o.fromTotalMinor, o.currency, locale)}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={
                        soldOut
                          ? 'inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted'
                          : 'inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success'
                      }
                      data-testid={`result-${o.categoryCode}-count`}
                    >
                      {soldOut ? (
                        <XCircle className="size-3.5" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      )}
                      {t.t('site.search.available', { n: o.bookableCount })}
                    </p>
                    <Link
                      href={`/${locale}/vehicles/${o.categoryCode}?${new URLSearchParams({ pickup, pickupAt, returnAt }).toString()}`}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t.t('site.search.viewReserve')}
                      <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </SiteContainer>
  );
}
