import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CarArt } from '../../components/marketing/art';

export const metadata: Metadata = {
  title: 'Page not found — Car Rental',
  robots: { index: false, follow: false },
};

/**
 * 404 for unmatched `/[locale]/…` paths (routed here by `[...notFound]/page.tsx`).
 *
 * Next renders this boundary with no route params, and in a production build it must not do
 * async data-loading (that throws in the committed streaming response), so the copy is static
 * English. Every *matched* page is fully localised; the "Go home" link points at `/`, which the
 * middleware redirects to the visitor's negotiated locale. The literals below are intentional
 * — this framework boundary cannot resolve a locale. i18n-ok
 */
const COPY = { body: 'Page not found.', home: 'Go home' };

export default function NotFound() {
  return (
    <div
      data-appstate="no-results"
      className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center"
    >
      <div className="relative flex w-full max-w-xs items-center justify-center overflow-hidden rounded-3xl bg-brand-gradient p-8 shadow-lift">
        <span className="aurora" aria-hidden="true" />
        <CarArt variant="compact" className="art-shadow relative w-3/4 text-on-brand" />
      </div>
      <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-ink">404</h1>
      <p className="mt-2 text-ink-muted">{COPY.body}</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {COPY.home}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
