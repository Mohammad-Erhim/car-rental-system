import { ArrowRight, PhoneCall } from 'lucide-react';
import Link from 'next/link';

import { CarArt } from './art';
import { Section, type Translate } from './section';

/** Closing call to action — brand band, one strong primary and a quiet secondary. */
export function CtaBand({ t, locale }: { t: Translate; locale: string }) {
  return (
    <Section tone="brand" className="mkt-section">
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="text-center lg:text-start">
          <h2 className="text-2xl font-bold tracking-tight text-brand-foreground sm:text-3xl md:text-4xl">
            {t('site.home.cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-foreground/85 lg:mx-0">
            {t('site.home.cta.subtitle')}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              href={`/${locale}/search`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-warm px-6 text-sm font-semibold text-warm-foreground shadow-lift transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
            >
              {t('site.home.cta.primary')}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href={`/${locale}/help`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-brand-foreground/30 bg-brand-foreground/10 px-6 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
            >
              <PhoneCall className="size-4" aria-hidden="true" />
              {t('site.home.cta.secondary')}
            </Link>
          </div>
        </div>
        <CarArt
          variant="premium"
          className="mkt-float mx-auto hidden w-full max-w-sm text-brand-foreground/90 lg:block"
        />
      </div>
    </Section>
  );
}
