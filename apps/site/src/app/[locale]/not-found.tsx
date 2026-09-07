import Link from 'next/link';

/** Locale-agnostic 404 (the segment 404 also renders here). */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Home
      </Link>
    </div>
  );
}
