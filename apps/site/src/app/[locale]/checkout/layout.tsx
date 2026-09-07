import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** Checkout carries a held quote and personal details — never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
