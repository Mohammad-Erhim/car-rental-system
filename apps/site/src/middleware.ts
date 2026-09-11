import { NextResponse, type NextRequest } from 'next/server';

import { getRuntimeLocales, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from './lib/i18n';

const PUBLIC_FILE = /\.(.*)$/;

function negotiate(req: NextRequest, codes: string[], defaultLocale: string): string {
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && codes.includes(cookie)) return cookie;
  const header = req.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const code = part.split(';')[0]?.trim().split('-')[0]?.toLowerCase();
    if (code && codes.includes(code)) return code;
  }
  return defaultLocale;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // let API/health rewrites, the /ops dashboard proxy, next internals, and static files through
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/health') ||
    pathname === '/ops' ||
    pathname.startsWith('/ops/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // the live enabled-locale set (DEC-024) — a language added/activated from the ops dashboard
  // is routable here within its short cache TTL, no site rebuild
  const runtime = await getRuntimeLocales();
  const codes = runtime.locales.map((l) => l.code);

  const pathLocale = codes.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));

  // A path that already carries a locale always wins — never redirect it. Just keep the cookie
  // in step so a later locale-less visit (`/`, a bare bookmark) resolves to the same language.
  if (pathLocale) {
    const res = NextResponse.next();
    if (req.cookies.get(LOCALE_COOKIE)?.value !== pathLocale) {
      res.cookies.set(LOCALE_COOKIE, pathLocale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE });
    }
    return res;
  }

  const locale = negotiate(req, codes, runtime.defaultLocale);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE });
  return res;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
