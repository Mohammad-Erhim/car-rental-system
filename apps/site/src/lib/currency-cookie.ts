/**
 * The visitor's chosen currency (DEC-036) as a cookie — the pure half: the name and how to read
 * it. Kept free of React so the server-rendered search page and the tests can use it alone.
 */

export const CURRENCY_COOKIE = 'carrental.currency';
export const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Pulls the currency out of a `Cookie` header / `document.cookie` string; anything that is not
 *  a three-letter code is ignored rather than trusted. */
export function parseCurrencyCookie(cookieString: string | null | undefined): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CURRENCY_COOKIE) {
      let value: string;
      try {
        value = decodeURIComponent(rest.join('=')).trim().toUpperCase();
      } catch {
        return undefined; // a malformed %-sequence in someone's cookie must not break the page
      }
      return /^[A-Z]{3}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}
