/**
 * FLOW-CUS-002 / SRS-UI-006: preserve the logical return target across an auth detour. Kept in
 * sessionStorage (survives the redirect) rather than only in the URL.
 */

const KEY = 'carrental.returnTo';

/**
 * A same-origin, path-only value — never a target an attacker can redirect off-site to. A plain
 * `startsWith('/') && !startsWith('//')` check (the previous guard here) still lets through a
 * value like `/\evil.com`: browsers resolve a leading backslash the same as a forward slash
 * against an http(s) base (WHATWG URL spec), so it behaves exactly like `//evil.com` — a
 * protocol-relative off-site redirect — despite passing that check. Resolving against a fixed
 * placeholder origin and requiring the origin to come back unchanged catches that and any other
 * scheme confusion (`javascript:`, backslash variants, etc.) in one general test.
 */
function isSafeRelativePath(v: string): boolean {
  if (!v.startsWith('/')) return false;
  const placeholder = 'http://carrental.invalid';
  try {
    return new URL(v, placeholder).origin === placeholder;
  } catch {
    return false;
  }
}

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
    if (v && isSafeRelativePath(v)) return v;
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
