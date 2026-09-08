import { CalendarCheck, MapPin, ShieldCheck, Star } from 'lucide-react';

import { HeroScene } from './art';
import type { Translate } from './section';

/**
 * Full-bleed hero: brand gradient + stylised road scene, headline, dual CTA, and a trust strip.
 * Holds the page's single `<h1>`. CTAs are in-page anchors — the booking card (`#book`) is
 * rendered by the page and pulled up to overlap this band's generous bottom padding, and the
 * fleet grid is `#fleet`.
 */
export function Hero({ t }: { t: Translate }) {
  const trust = [
    { Icon: ShieldCheck, label: t('site.home.trust.cancel.title') },
    { Icon: CalendarCheck, label: t('site.home.trust.support.title') },
    { Icon: MapPin, label: t('site.home.trust.locations.title') },
  ];

  return (
    <section className="band band-brand relative isolate overflow-hidden">
      {/* scene + veil */}
      <HeroScene className="pointer-events-none absolute inset-0 -z-10 h-full w-full" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ backgroundImage: 'var(--gradient-hero-veil)' }}
      />
      <span
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.15]"
      />

      <div className="mkt-container pb-40 pt-20 md:pb-48 md:pt-28 lg:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow justify-center text-[0.8rem] text-warm">
            <span aria-hidden="true" className="h-px w-6 bg-current opacity-70" />
            {t('site.home.heroEyebrow')}
          </span>

          <h1 className="headline mt-5 text-brand-foreground">{t('site.home.heroTitle')}</h1>

          <p className="subhead mx-auto mt-6 max-w-2xl text-base text-brand-foreground/85 sm:text-lg">
            {t('site.home.heroSubtitle')}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#book"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-warm px-6 text-sm font-semibold text-warm-foreground shadow-lift transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
            >
              {t('site.home.heroPrimaryCta')}
            </a>
            <a
              href="#fleet"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-brand-foreground/30 bg-brand-foreground/10 px-6 text-sm font-semibold text-brand-foreground backdrop-blur transition-colors hover:bg-brand-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
            >
              {t('site.home.heroSecondaryCta')}
            </a>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-brand-foreground/90 sm:flex-row sm:justify-center sm:gap-6">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <span className="inline-flex" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-warm text-warm" />
                ))}
              </span>
              {t('site.home.heroRating')}
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              {trust.map(({ Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="size-4 text-warm" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
