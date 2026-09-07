import type { Metadata } from 'next';
import Link from 'next/link';

import { HomeSearch, type LocationOption } from '../../../components/home-search';
import { apiGet, apiPost } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

interface Option {
  categoryCode: string;
  categoryName: string;
  available: number;
  estimatedTotal?: { amountMinor: number; currency: string } | null;
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
  const hasResults = (data?.options.length ?? 0) > 0;
  const searched = Boolean(pickup && pickupAt && returnAt);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.t('site.search.title')}</h1>

      <div className="rounded-lg border bg-card p-4">
        <HomeSearch
          locale={locale}
          locations={locations}
          initialPickup={pickup}
          initialPickupAt={pickupAt || undefined}
          initialReturnAt={returnAt || undefined}
        />
      </div>

      {!searched ? (
        <p className="text-sm text-muted-foreground">{t.t('site.search.noQuery')}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t.t('site.search.summary', { location: pickup })}
        </p>
      )}

      {failure === 'badLocation' ? (
        <p className="text-sm text-destructive">{t.t('site.search.badLocation')}</p>
      ) : failure === 'generic' ? (
        <p className="text-sm text-destructive">{t.t('error.generic')}</p>
      ) : null}

      {notices.length ? (
        <ul className="space-y-1 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
          {notices.map((n) => (
            <li key={n.code}>{noticeText(t.t, n)}</li>
          ))}
        </ul>
      ) : null}

      {searched && !failure && !hasResults && !notices.length ? (
        <p className="text-sm text-muted-foreground">{t.t('site.search.noResults')}</p>
      ) : null}

      {hasResults ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data!.options.map((o) => (
            <li key={o.categoryCode} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{o.categoryName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t.t('site.search.available', { n: o.available })}
                  </p>
                </div>
                {o.estimatedTotal ? (
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {money(o.estimatedTotal.amountMinor, o.estimatedTotal.currency, locale)}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/${locale}/vehicles/${o.categoryCode}?${new URLSearchParams({ pickup, pickupAt, returnAt }).toString()}`}
                className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t.t('action.viewDetails')}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
