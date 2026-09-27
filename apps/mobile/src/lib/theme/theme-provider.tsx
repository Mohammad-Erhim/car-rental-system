import type { BrandingResponse } from '@carrental/contracts';
import { DEFAULT_BRAND_CONFIG, type BrandConfig } from '@carrental/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { apiFetch } from '../api/api-fetch';

import { radiusPx, resolveRNColors, space, typography, type RNColorScale } from './tokens';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: RNColorScale;
  radius: number;
  density: BrandConfig['density'];
  space: typeof space;
  typography: typeof typography;
  wordmark: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const BRAND_CACHE_KEY = 'carrental.brand.v1';
const PREFERENCE_KEY = 'carrental.theme.preference';

/**
 * RN counterpart of `@carrental/ui`'s web `ThemeProvider`: fetches the org's published brand
 * config (`GET /meta/branding`, DEC-025, the same endpoint `apps/site` reads for its CSS-variable
 * overlay) and resolves it to RN-usable colors via `@carrental/theme`'s own token catalogue — no
 * CSS, no re-typed palette. Falls back to `DEFAULT_BRAND_CONFIG` (same shipped green brand as
 * every other surface) instantly, then reconciles once the network call resolves.
 */
export function ThemeProvider({
  children,
  onReady,
}: {
  children: ReactNode;
  /** Fires once the persisted theme preference has been read — the local (no-network) bootstrap
   *  the splash screen waits on, per `RootLayout`, so it never hides onto a frame that briefly
   *  resolved to the system scheme before flipping to an explicit saved light/dark choice. Cached
   *  branding is best-effort and not gated on — a real (uncached) brand fetch is a network call,
   *  and the shipped `DEFAULT_BRAND_CONFIG` fallback already renders correctly with no flash. */
  onReady?: () => void;
}) {
  const deviceScheme = useDeviceColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [cachedConfig, setCachedConfig] = useState<BrandConfig | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREFERENCE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
      onReady?.();
    });
    AsyncStorage.getItem(BRAND_CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
        setCachedConfig(JSON.parse(raw) as BrandConfig);
      } catch {
        /* ignore corrupt cache */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount, not on every onReady identity change
  }, []);

  const brandingQuery = useQuery({
    queryKey: ['meta', 'branding'],
    queryFn: ({ signal }) =>
      apiFetch<BrandingResponse>('/meta/branding', { signal, anonymous: true }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (brandingQuery.data) {
      void AsyncStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(brandingQuery.data.config));
    }
  }, [brandingQuery.data]);

  const config = brandingQuery.data?.config ?? cachedConfig ?? DEFAULT_BRAND_CONFIG;

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    void AsyncStorage.setItem(PREFERENCE_KEY, p);
  };

  const mode: ThemeMode = preference === 'system' ? (deviceScheme ?? 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference,
      colors: resolveRNColors(config.colors[mode]),
      radius: radiusPx(config.radius as Parameters<typeof radiusPx>[0]),
      density: config.density,
      space,
      typography,
      wordmark: config.assets.wordmark,
    }),
    [mode, preference, config],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
