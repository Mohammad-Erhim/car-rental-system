import './globals.css';

import type { ReactNode } from 'react';

/**
 * Pass-through root layout. The real `<html lang dir>` + providers live in
 * `app/[locale]/layout.tsx` so they can be locale-aware (Next.js i18n routing pattern).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
