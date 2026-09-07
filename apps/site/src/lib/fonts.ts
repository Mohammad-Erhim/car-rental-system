/**
 * Curated web fonts for the public site (DEC-025). `next/font/google` self-hosts each face at
 * build time (no runtime request to Google), adds `font-display: swap`, and computes fallback
 * metrics so the swap doesn't shift layout. The brand `font` key selects which `--font-brand`
 * variable is live; `--font-sans` in `globals.css` points at it.
 *
 * `system` intentionally has no web font — it resolves straight to the platform UI stack.
 */
import { Cairo, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Inter, Tajawal } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand',
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand',
});
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-brand-arabic',
});

const cairo = Cairo({
  subsets: ['latin', 'arabic'],
  display: 'swap',
  variable: '--font-brand',
});

const tajawal = Tajawal({
  weight: ['400', '500', '700'],
  subsets: ['latin', 'arabic'],
  display: 'swap',
  variable: '--font-brand',
});

/** Font key (from the brand config) → the `className`(s) that expose `--font-brand`. */
export function fontClassName(fontKey: string): string {
  switch (fontKey) {
    case 'inter':
      return inter.variable;
    case 'ibm-plex-sans':
      return `${ibmPlexSans.variable} ${ibmPlexSansArabic.variable}`;
    case 'cairo':
      return cairo.variable;
    case 'tajawal':
      return tajawal.variable;
    case 'system':
    default:
      return '';
  }
}
