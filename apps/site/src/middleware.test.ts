import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from './middleware';

const req = (path: string, cookie?: string) =>
  new NextRequest(`https://example.com${path}`, {
    headers: cookie ? { cookie } : undefined,
  });

describe('site locale middleware', () => {
  it('redirects a locale-less path to the negotiated locale and stamps the cookie', () => {
    const res = middleware(req('/search'));
    expect(res.headers.get('location')).toBe('https://example.com/en/search');
    expect(res.cookies.get('carrental.locale')?.value).toBe('en');
  });

  it('honours the locale cookie for a locale-less path', () => {
    const res = middleware(req('/', 'carrental.locale=fr'));
    expect(res.headers.get('location')).toBe('https://example.com/fr');
  });

  it('honours accept-language when there is no cookie', () => {
    const res = new NextRequest('https://example.com/', {
      headers: { 'accept-language': 'ar-SA,ar;q=0.9,en;q=0.5' },
    });
    expect(middleware(res).headers.get('location')).toBe('https://example.com/ar');
  });

  it('never redirects a path that already carries a locale — the URL wins', () => {
    // even when the saved locale is something else
    expect(middleware(req('/ar', 'carrental.locale=en')).headers.get('location')).toBeNull();
    expect(
      middleware(req('/en/vehicles/economy', 'carrental.locale=fr')).headers.get('location'),
    ).toBeNull();
  });

  it('refreshes the cookie to match the locale in the URL', () => {
    const res = middleware(req('/ar/search', 'carrental.locale=en'));
    expect(res.cookies.get('carrental.locale')?.value).toBe('ar');
  });

  it('leaves the cookie alone when it already matches the URL', () => {
    const res = middleware(req('/fr/search', 'carrental.locale=fr'));
    expect(res.cookies.get('carrental.locale')).toBeUndefined();
  });

  it('passes API and static paths straight through', () => {
    expect(middleware(req('/api/v1/health')).headers.get('location')).toBeNull();
    expect(middleware(req('/logo.svg')).headers.get('location')).toBeNull();
  });
});
