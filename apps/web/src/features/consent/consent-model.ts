import type { ConsentConfig, Localized } from '@carrental/contracts';

import { localizedGet } from '@/lib/localized';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export type CookieRow = ConsentConfig['cookieTable'][number];

export const newCookieRow = (): CookieRow => ({
  name: '',
  provider: '',
  category: 'necessary',
  purpose: { en: '' },
  duration: '',
});

/** Human-readable list of what is wrong with a config, one line per problem. */
export function issueLines(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`);
}

/** How many of a localized value's languages are filled in. */
export const translatedCount = (value: Localized | undefined, locales: string[]) =>
  locales.filter((l) => localizedGet(value, l).trim() !== '').length;
