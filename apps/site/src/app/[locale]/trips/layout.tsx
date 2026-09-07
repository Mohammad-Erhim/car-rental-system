import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** A customer's own trips are private — never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TripsLayout({ children }: { children: ReactNode }) {
  return children;
}
