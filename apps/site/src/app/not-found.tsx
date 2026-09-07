import Link from 'next/link';

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
          <p style={{ marginBottom: '1rem' }}>Page not found.</p>
          <Link href="/">Home</Link>
        </main>
      </body>
    </html>
  );
}
