import {
  BRAND_CACHE_KEY,
  BRAND_CSS_CACHE_KEY,
  BRAND_TOKENS_STYLE_ID,
  brandConfigToCss,
  type BrandConfig,
} from '@carrental/theme';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  /** false until the client effect has read the stored preference — use to avoid SSR flicker. */
  mounted: boolean;
  /** The active brand config (defaults applied by the API when nothing is published). */
  brand: BrandConfig | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'carrental.theme';

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

/** Inject / update the `<style>` element that carries a published brand's token overrides. */
export function applyBrandTokens(brand: BrandConfig | null): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(BRAND_TOKENS_STYLE_ID);
  if (!brand) {
    existing?.remove();
    return;
  }
  const css = brandConfigToCss(brand);
  const el = existing ?? document.createElement('style');
  el.id = BRAND_TOKENS_STYLE_ID;
  el.textContent = css;
  if (!existing) document.head.appendChild(el);
  document.documentElement.dataset.density = brand.density;
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(brand));
    localStorage.setItem(BRAND_CSS_CACHE_KEY, css);
  } catch {
    /* storage may be unavailable */
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY,
  brand = null,
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  /** Published brand config from `GET /api/v1/meta/branding` (or null to use built-in defaults). */
  brand?: BrandConfig | null;
}) {
  // First render (SSR + first client paint) is deterministic: always `defaultTheme`. The stored
  // preference is applied in the effect below, after hydration — no #418/#423 mismatch.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSystemDark(systemPrefersDark());
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored);
    } catch {
      /* storage may be unavailable */
    }
  }, [storageKey]);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (typeof document === 'undefined' || !mounted) return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, mounted]);

  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemDark(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    applyBrandTokens(brand);
  }, [brand]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      try {
        localStorage.setItem(storageKey, t);
      } catch {
        /* storage may be unavailable */
      }
    },
    [storageKey],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, mounted, brand }),
    [theme, resolvedTheme, setTheme, mounted, brand],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
