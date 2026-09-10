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

/**
 * First-visit locale: stored choice → browser preference → null. When `supported` is given the
 * result is restricted to it; otherwise any non-empty candidate is returned and the i18n
 * provider clamps it against the runtime locale list once `/meta/locales` loads.
 */
export function detectInitialLocale(supported?: string[]): string | null {
  const ok = (c: string | null | undefined): c is string =>
    !!c && (!supported || supported.includes(c));

  const stored = getStoredLocale();
  if (ok(stored)) return stored;
  if (typeof navigator !== 'undefined') {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const base = lang?.split('-')[0];
      if (ok(base)) return base ?? null;
    }
  }
  return null;
}
