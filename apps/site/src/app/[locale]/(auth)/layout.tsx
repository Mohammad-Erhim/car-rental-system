import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CarArt } from '../../../components/marketing/art';
import { getT } from '../../../lib/i18n';

/** Auth screens (sign-in / register / recovery) — never indexed (SRS-SEC / SEO). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  const { t } = await getT(locale);
  const points = [t('site.auth.point1'), t('site.auth.point2'), t('site.auth.point3')];

  return (
    <div className="mkt-container py-10 md:py-16">
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-hairline bg-surface shadow-lift md:grid-cols-2">
        {/* brand panel — hidden on small screens */}
        <aside className="band-brand relative hidden flex-col justify-between overflow-hidden p-8 md:flex lg:p-10">
          <span className="aurora" aria-hidden="true" />
          <Link
            href={`/${locale}`}
            className="relative inline-flex items-center gap-2 font-semibold text-on-brand"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-on-brand/15">
              <CarArt variant="economy" className="w-6 text-on-brand" />
            </span>
            {t('app.name')}
          </Link>

          <div className="relative mt-8">
            <p className="eyebrow text-warm">{t('site.auth.eyebrow')}</p>
            {/* not a heading — keeps the form's <h1> first in the document outline */}
            <p className="mt-3 text-2xl font-bold tracking-tight text-on-brand">
              {t('site.auth.pitchTitle')}
            </p>
            <p className="mt-2 max-w-sm text-sm text-on-brand/80">{t('site.auth.pitchText')}</p>
            <ul className="mt-6 space-y-2.5 text-sm text-on-brand/90">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-warm" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <CarArt
            variant="premium"
            className="relative mt-8 w-2/3 self-end text-on-brand/85 rtl:-scale-x-100"
          />
        </aside>

        {/* form column */}
        <div className="p-6 sm:p-8 lg:p-10">
          <Link
            href={`/${locale}`}
            className="mb-6 inline-flex items-center gap-2 font-semibold text-ink md:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-on-brand">
              <CarArt variant="economy" className="w-5" />
            </span>
            {t('app.name')}
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
