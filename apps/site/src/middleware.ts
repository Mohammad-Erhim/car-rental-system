import { NextResponse, type NextRequest } from 'next/server';

import { ACTIVE_LOCALES, DEFAULT_LOCALE } from './lib/i18n';

const PUBLIC_FILE = /\.(.*)$/;
const LOCALE_COOKIE = 'carrental.locale';

function negotiate(req: NextRequest): string {
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && ACTIVE_LOCALES.includes(cookie)) return cookie;
  const header = req.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const code = part.split(';')[0]?.trim().split('-')[0]?.toLowerCase();
    if (code && ACTIVE_LOCALES.includes(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // let API/health rewrites, next internals, and static files through
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/health') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasLocale = ACTIVE_LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = negotiate(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
