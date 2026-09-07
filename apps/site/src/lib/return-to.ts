/**
 * FLOW-CUS-002 / SRS-UI-006: preserve the logical return target across an auth detour.
 * Kept in sessionStorage (survives the redirect) rather than only in the URL.
 */
'use client';

const KEY = 'carrental.returnTo';

export function stashReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function takeReturnTo(fallback = '/'): string {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (v && v.startsWith('/') && !v.startsWith('//')) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function peekReturnTo(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
