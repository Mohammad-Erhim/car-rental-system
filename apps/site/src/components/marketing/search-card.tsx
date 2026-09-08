import { CalendarRange, Sparkles } from 'lucide-react';

import { HomeSearch, type LocationOption } from '../home-search';

import type { Translate } from './section';

/**
 * The booking widget, lifted into an elevated card that overlaps the hero. Wraps the existing
 * `HomeSearch` island unchanged (its e2e test ids and behaviour are load-bearing).
 */
export function SearchCard({
  t,
  locale,
  locations,
}: {
  t: Translate;
  locale: string;
  locations: LocationOption[];
}) {
  return (
    <div id="book" className="scroll-anchor mkt-container relative z-10 -mt-28 md:-mt-32">
      <div className="mx-auto max-w-4xl surface-card rounded-3xl p-5 shadow-lift md:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
            <span className="icon-chip icon-chip-warm size-9 rounded-lg">
              <CalendarRange className="size-5" aria-hidden="true" />
            </span>
            {t('site.home.searchCardTitle')}
          </h2>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Sparkles className="size-3.5 text-warm-strong" aria-hidden="true" />
            {t('site.home.searchCardHint')}
          </p>
        </div>
        <HomeSearch locale={locale} locations={locations} />
      </div>
    </div>
  );
}
