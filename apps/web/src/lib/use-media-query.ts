import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query. SSR-safe (returns `false` without `window`). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `lg` breakpoint — the sidebar becomes an off-canvas drawer. */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 1024px)');
}
