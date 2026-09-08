import type { ReactNode } from 'react';

/**
 * Centered page container for the app-style routes (search, vehicle, account, trips, checkout,
 * legal, help, not-found). The shared `<main>` is now edge-to-edge so the marketing homepage can
 * run full-bleed hero / stat / CTA bands; every other page opts back into this gutter + max-width
 * + vertical rhythm. Matches the previous `<main class="mx-auto max-w-6xl px-4 py-8 md:py-12">`.
 */
const WIDTH = {
  default: 'max-w-6xl',
  md: 'max-w-3xl',
  sm: 'max-w-md',
} as const;

export function SiteContainer({
  children,
  size = 'default',
  as: Tag = 'div',
  className = '',
}: {
  children: ReactNode;
  size?: keyof typeof WIDTH;
  as?: 'div' | 'article' | 'section';
  className?: string;
}) {
  return (
    <Tag
      className={`mx-auto w-full ${WIDTH[size]} px-4 py-8 sm:px-6 md:py-12 lg:px-8 ${className}`}
    >
      {children}
    </Tag>
  );
}
