const KEY = 'carrental.locale';

export function getStoredLocale(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeLocale(locale: string): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

/** First-visit locale: stored choice → browser preference → null (provider falls back to default). */
export function detectInitialLocale(supported: string[]): string | null {
  const stored = getStoredLocale();
  if (stored && supported.includes(stored)) return stored;
  if (typeof navigator !== 'undefined') {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const base = lang?.split('-')[0];
      if (base && supported.includes(base)) return base;
    }
  }
  return null;
}
