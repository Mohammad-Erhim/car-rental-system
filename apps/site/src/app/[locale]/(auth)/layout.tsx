import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** Auth screens (sign-in / register / recovery) — never indexed (SRS-SEC / SEO). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md">{children}</div>;
}
