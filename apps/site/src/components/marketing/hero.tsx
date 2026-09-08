import { CalendarCheck, MapPin, ShieldCheck, Star } from 'lucide-react';

import { HeroScene } from './art';
import { cx, type Translate } from './section';

/**
 * Full-bleed hero: brand gradient + stylised road scene (or an uploaded background image),
 * headline, dual CTA, and a trust strip. Holds the page's `<h1>` by default. Content is driven
 * by `t` (the block renderer wraps it with page-builder copy); non-text options come as props.
 */
export function Hero({
  t,
  heading = 'h1',
  background = null,
  overlayOpacity,
  textAlign = 'center',
  primaryHref = '#book',
  secondaryHref = '#fleet',
}: {
  t: Translate;
  heading?: 'h1' | 'h2';
  background?: string | null;
  overlayOpacity?: number;
  textAlign?: 'center' | 'start';
  primaryHref?: string;
  secondaryHref?: string | null;
}) {
  const Heading = heading;
  const trust = [
    { Icon: ShieldCheck, label: t('site.home.trust.cancel.title') },
    { Icon: CalendarCheck, label: t('site.home.trust.support.title') },
    { Icon: MapPin, label: t('site.home.trust.locations.title') },
  ];
  const align = textAlign === 'start' ? 'text-start' : 'text-center';

  return (
    <section className="band band-brand relative isolate overflow-hidden">
      {background ? (
        <>
          <img
            src={background}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[hsl(var(--hero-ink))]"
            style={{ opacity: overlayOpacity ?? 0.4 }}
          />
        </>
      ) : (
        <>
          <HeroScene className="pointer-events-none absolute inset-0 -z-10 h-full w-full" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ backgroundImage: 'var(--gradient-hero-veil)' }}
          />
        </>
      )}
      <span
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.15]"
      />

      <div className="mkt-container pb-40 pt-20 md:pb-48 md:pt-28 lg:pt-32">
        <div className={cx('max-w-3xl', textAlign === 'start' ? 'me-auto' : 'mx-auto', align)}>
          <span
            className={cx(
              'eyebrow text-[0.8rem] text-warm',
              textAlign === 'start' ? '' : 'justify-center',
            )}
          >
            <span aria-hidden="true" className="h-px w-6 bg-current opacity-70" />
            {t('site.home.heroEyebrow')}
          </span>

          <Heading className="headline mt-5 text-brand-foreground">
            {t('site.home.heroTitle')}
          </Heading>

          <p
            className={cx(
              'subhead mt-6 max-w-2xl text-base text-brand-foreground/85 sm:text-lg',
              textAlign === 'start' ? '' : 'mx-auto',
            )}
          >
            {t('site.home.heroSubtitle')}
          </p>

          <div
            className={cx(
              'mt-9 flex flex-col gap-3 sm:flex-row',
              textAlign === 'start' ? 'items-start' : 'items-center justify-center',
            )}
          >
            <a
              href={primaryHref}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-warm px-6 text-sm font-semibold text-warm-foreground shadow-lift transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
            >
              {t('site.home.heroPrimaryCta')}
            </a>
            {secondaryHref ? (
              <a
                href={secondaryHref}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-brand-foreground/30 bg-brand-foreground/10 px-6 text-sm font-semibold text-brand-foreground backdrop-blur transition-colors hover:bg-brand-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-strong"
              >
                {t('site.home.heroSecondaryCta')}
              </a>
            ) : null}
          </div>

          <div
            className={cx(
              'mt-8 flex flex-col gap-3 text-brand-foreground/90 sm:flex-row sm:gap-6',
              textAlign === 'start' ? 'items-start' : 'items-center sm:justify-center',
            )}
          >
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <span className="inline-flex" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-warm text-warm" />
                ))}
              </span>
              {t('site.home.heroRating')}
            </p>
            <ul
              className={cx(
                'flex flex-wrap items-center gap-x-5 gap-y-2 text-sm',
                textAlign === 'start' ? '' : 'justify-center',
              )}
            >
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
