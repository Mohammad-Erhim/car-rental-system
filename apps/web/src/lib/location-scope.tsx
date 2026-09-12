import { useAuth } from '@carrental/client/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useLocations, type Location } from './discovery-hooks.js';

const STORAGE_KEY = 'carrental.ops.location';
/** sentinel for "no narrowing" — kept out of the URL/localStorage value space of real codes */
export const ALL_LOCATIONS = 'all';

interface LocationScopeValue {
  /** the actor's own permitted locations, narrowed further by `selected` — this is what every
   *  scoped page/query should filter by; `undefined` means unrestricted (org-wide actor, "all"
   *  selected). Never wider than `options`. */
  selected: string | undefined;
  setSelected: (code: string) => void;
  /** locations this actor may pick from at all — `useLocations()`'s full org list intersected
   *  with the actor's own `locationScope` (or the full list, for an org-wide actor) */
  options: Location[];
  /** true once `options` has loaded and a persisted-but-now-invalid selection has been reset */
  ready: boolean;
}

const LocationScopeContext = createContext<LocationScopeValue | null>(null);

/**
 * A single cross-page "which location am I looking at" preference (the sidebar/header switcher).
 * Follows the same shape as `ThemeProvider`/`useTheme()` (`packages/ui`): a context + provider +
 * hook, persisted to `localStorage`, memoized value — the closest existing template for
 * "one small piece of client-only state every ops screen may want to read."
 *
 * Deliberately app-local (`apps/web`), not `@carrental/*` — this is ops-shell chrome with no
 * counterpart need in `apps/site` (the customer booking flow already has its own pickup-location
 * picker, a different concept: a trip's location, not a staff member's viewing scope).
 *
 * `selected` is always a location the actor is actually permitted to see: it is validated against
 * `options` on every load (an actor's own scope can change — a role edit, a fresh sign-in — and a
 * stale `localStorage` value must never silently keep filtering by a location that's no longer
 * theirs) and reset to "all" the moment it falls out of range.
 */
export function LocationScopeProvider({ children }: { children: ReactNode }) {
  const { actor } = useAuth();
  const locations = useLocations();
  const [raw, setRaw] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? ALL_LOCATIONS;
    } catch {
      return ALL_LOCATIONS;
    }
  });

  const ownScope = actor?.locationScope;
  const options = useMemo(() => {
    const all = locations.data ?? [];
    if (!ownScope?.length) return all;
    const scoped = new Set(ownScope);
    return all.filter((l) => scoped.has(l.code));
  }, [locations.data, ownScope]);

  const ready = locations.status !== 'pending';

  // A requested/persisted code the actor can no longer see (role change, different account,
  // location archived) resets to "all" rather than silently filtering by a code that no longer
  // applies — same "never widen, and never carry forward a stale narrowing" principle as the
  // backend's `effectiveScope()`.
  useEffect(() => {
    if (!ready) return;
    if (raw !== ALL_LOCATIONS && !options.some((o) => o.code === raw)) {
      setRaw(ALL_LOCATIONS);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* storage may be unavailable */
      }
    }
  }, [ready, raw, options]);

  const setSelected = useCallback((code: string) => {
    setRaw(code);
    try {
      if (code === ALL_LOCATIONS) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const selected = raw === ALL_LOCATIONS ? undefined : raw;

  const value = useMemo(
    () => ({ selected, setSelected, options, ready }),
    [selected, setSelected, options, ready],
  );

  return <LocationScopeContext.Provider value={value}>{children}</LocationScopeContext.Provider>;
}

export function useLocationScope(): LocationScopeValue {
  const ctx = useContext(LocationScopeContext);
  if (!ctx) throw new Error('useLocationScope must be used within <LocationScopeProvider>');
  return ctx;
}
