import Link from 'next/link';

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
    <div data-appstate="no-results" className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">{COPY.body}</p>
      <Link
        href="/"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {COPY.home}
      </Link>
    </div>
  );
}
