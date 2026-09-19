import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useLocationOptions, type LocationOption } from './location-hooks';

import { isLocationScopedPath } from '@/app/paths';

const PARAM = 'location';
const storageKey = (accountId: string | undefined) => `carrental.ops.location.${accountId ?? ''}`;

const parse = (csv: string | null | undefined): string[] => [
  ...new Set(
    (csv ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  ),
];

function readStored(accountId: string | undefined): string[] {
  try {
    return parse(localStorage.getItem(storageKey(accountId)));
  } catch {
    return [];
  }
}

function writeStored(accountId: string | undefined, codes: string[]) {
  try {
    if (codes.length) localStorage.setItem(storageKey(accountId), codes.join(','));
    else localStorage.removeItem(storageKey(accountId));
  } catch {
    /* storage may be unavailable */
  }
}

interface LocationScopeValue {
  /** every location this account may pick from (active AND archived), as of the last fetch */
  options: LocationOption[];
  /** the codes currently narrowing the page; `[]` = all of this account's locations */
  selected: string[];
  /** `selected` as the `locationCode` query value every scoped API call takes (CSV), or undefined */
  codes: string | undefined;
  setSelected: (codes: string[]) => void;
  /** back to "all of my locations" */
  clear: () => void;
  /** the options have loaded and the URL agrees with them — safe to fire scoped queries */
  ready: boolean;
  /** the options could not be loaded */
  error: boolean;
  retry: () => void;
  /** this account is limited to specific locations (vs organisation-wide) */
  restricted: boolean;
  /** the current page is narrowed by the selection (see `isLocationScopedPath`) */
  scopedPage: boolean;
  /** display name of a code (falls back to the code itself) */
  nameOf: (code: string) => string;
}

const LocationScopeContext = createContext<LocationScopeValue | null>(null);

/**
 * The ONE "which locations am I looking at" state for the operations console — the top-bar
 * filter. It is the single source of truth for every branch-aware page (dashboard, reservations,
 * rentals, fleet, search, reports, rate plans); pages no longer carry a location filter of their
 * own.
 *
 * - **The URL is the state** (`?location=LHR,JFK`) on those pages, so a view is shareable and
 *   survives refresh and Back. The last choice is also remembered per account (localStorage) and
 *   re-applied when the account opens another branch-aware page without one.
 * - **Never wider than the account's scope, never stale**: the selection is checked against
 *   `/ops/locations/options`, which the API computes per request from the account's CURRENT scope
 *   (not the one baked into the session at sign-in). A code the account can no longer see —
 *   scope narrowed, branch removed — is dropped, and the user is told.
 * - Multi-select; an empty selection means "all of my locations".
 *
 * Mounted inside the router (it reads and writes the URL) — see `DashboardLayout`.
 */
export function LocationScopeProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { actor } = useAuth();
  const accountId = actor?.accountId;
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const query = useLocationOptions();
  const scopedPage = isLocationScopedPath(pathname);
  const [stored, setStored] = useState<string[]>(() => readStored(accountId));
  const notified = useRef('');

  const options = useMemo(() => query.data?.options ?? [], [query.data]);
  const loaded = query.status === 'success';
  const known = useMemo(() => new Set(options.map((o) => o.code)), [options]);
  const clamp = useCallback(
    (codes: string[]) => (loaded ? codes.filter((c) => known.has(c)) : codes),
    [loaded, known],
  );

  const hasParam = params.has(PARAM);
  const urlCodes = useMemo(() => parse(params.get(PARAM)), [params]);
  const urlValid = useMemo(() => clamp(urlCodes), [clamp, urlCodes]);
  const storedValid = useMemo(() => clamp(stored), [clamp, stored]);

  // on a branch-aware page the URL wins; elsewhere (or before the URL has been filled in) the
  // remembered choice is what the header shows
  const selected = scopedPage && hasParam ? urlValid : storedValid;
  // a branch-aware page opened without the param, while a choice is remembered: hold the page for
  // the one render it takes to put the choice in the URL, so no query fires for the wrong scope
  const injecting = scopedPage && loaded && !hasParam && storedValid.length > 0;

  const setUrl = useCallback(
    (codes: string[]) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (codes.length) next.set(PARAM, codes.join(','));
          else next.delete(PARAM);
          next.delete('page'); // a different result set — the old page number means nothing
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // keep the URL honest: drop codes the account may not see (and say so), or fill it in from the
  // remembered choice; remember whatever valid selection the URL carries
  useEffect(() => {
    if (!loaded || !scopedPage) return;
    if (hasParam) {
      if (urlValid.length !== urlCodes.length) {
        const dropped = urlCodes.filter((c) => !known.has(c));
        const key = dropped.join(',');
        if (notified.current !== key) {
          notified.current = key;
          toast.warning(t('ops.locFilter.clamped', { codes: dropped.join(', ') }));
        }
        setUrl(urlValid);
        return;
      }
      if (urlValid.join(',') !== stored.join(',')) {
        setStored(urlValid);
        writeStored(accountId, urlValid);
      }
    } else if (storedValid.length) {
      setUrl(storedValid);
    }
  }, [
    loaded,
    scopedPage,
    hasParam,
    urlValid,
    urlCodes,
    known,
    stored,
    storedValid,
    accountId,
    setUrl,
    t,
  ]);

  // another tab picked a different default: use it for pages opened from now on (an open page keeps
  // its own URL — two tabs on two branches is a legitimate way to work)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(accountId)) setStored(readStored(accountId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [accountId]);

  const setSelected = useCallback(
    (codes: string[]) => {
      const clean = clamp([...new Set(codes)]);
      const active = options.filter((o) => o.status === 'active');
      // every active branch and no archived one is just "all" — keep the URL short and future-proof
      const everything =
        active.length > 0 &&
        clean.length === active.length &&
        clean.every((c) => active.some((o) => o.code === c));
      const next = everything ? [] : clean;
      setStored(next);
      writeStored(accountId, next);
      if (scopedPage) setUrl(next);
    },
    [accountId, clamp, options, scopedPage, setUrl],
  );

  const nameOf = useCallback(
    (code: string) => options.find((o) => o.code === code)?.name ?? code,
    [options],
  );

  const value = useMemo<LocationScopeValue>(
    () => ({
      options,
      selected,
      codes: selected.length ? selected.join(',') : undefined,
      setSelected,
      clear: () => setSelected([]),
      ready: loaded && !injecting,
      error: query.status === 'error',
      retry: () => void query.refetch(),
      // from the server, as of the last fetch — the session's copy of the scope can be stale
      restricted: query.data?.restricted ?? (actor?.locationScope?.length ?? 0) > 0,
      scopedPage,
      nameOf,
    }),
    [
      options,
      selected,
      setSelected,
      loaded,
      injecting,
      query,
      actor?.locationScope,
      scopedPage,
      nameOf,
    ],
  );

  return <LocationScopeContext.Provider value={value}>{children}</LocationScopeContext.Provider>;
}

export function useLocationScope(): LocationScopeValue {
  const ctx = useContext(LocationScopeContext);
  if (!ctx) throw new Error('useLocationScope must be used within <LocationScopeProvider>');
  return ctx;
}

/**
 * Whether the account may act at a branch — used to hide row actions that belong to a branch it does
 * not work at (e.g. a return branch cannot hand over the keys of a one-way hire it did not start).
 * The API refuses them regardless; this only keeps the UI from offering a button that would fail.
 * Permissive when there is no provider (tests, isolated components) or the account is not limited.
 */
export function useLocationAccess() {
  const ctx = useContext(LocationScopeContext);
  return useCallback(
    (code: string | null | undefined): boolean =>
      !ctx || !ctx.restricted || !code || ctx.options.some((o) => o.code === code),
    [ctx],
  );
}

/** The top-bar selection, or `[]` outside a provider — for forms that only want to pre-fill from it. */
export function useSelectedLocations(): string[] {
  return useContext(LocationScopeContext)?.selected ?? [];
}
