import { cookies } from 'next/headers';

import { CURRENCY_COOKIE, parseCurrencyCookie } from './currency-cookie';

/** The visitor's chosen currency, for server-rendered pages (see `currency.ts`). */
export function preferredCurrencyFromRequest(): string | undefined {
  const value = cookies().get(CURRENCY_COOKIE)?.value;
  return parseCurrencyCookie(value ? `${CURRENCY_COOKIE}=${value}` : undefined);
}
