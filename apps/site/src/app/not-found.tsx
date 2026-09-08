import Link from 'next/link';

// This file renders before any locale is resolved and outside every provider, so it cannot use
// the i18n catalogue. Every real 404 inside the app is handled by `[locale]/not-found.tsx`.
const FALLBACK_404 = 'Page not found.';

/** Root-level 404 (outside a locale segment). Locale pages use `[locale]/not-found.tsx`. */
export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
        }}
      >
        <main style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>404</h1>
          <p style={{ marginBottom: '1rem' }}>
            {FALLBACK_404 /* i18n-ok: pre-locale, no provider */}
          </p>
          <Link href="/">Home</Link>
        </main>
      </body>
    </html>
  );
}
