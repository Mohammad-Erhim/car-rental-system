import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.fn();
vi.mock('./api', () => ({ apiGet: (...args: unknown[]) => apiGetMock(...args) }));

const dynamicLocalesResponse = {
  defaultLocale: 'en',
  locales: [
    {
      code: 'en',
      nativeName: 'English',
      englishName: 'English',
      direction: 'ltr' as const,
      isDefault: true,
      fallback: [],
      testOnly: false,
    },
    {
      code: 'es',
      nativeName: 'Español',
      englishName: 'Spanish',
      direction: 'ltr' as const,
      isDefault: false,
      fallback: ['en'],
      testOnly: false,
    },
  ],
};

// `getRuntimeLocales` keeps a module-scope TTL cache — reset the module between tests so each
// one starts from a clean cache and its own `apiGet` mock behaviour.
beforeEach(() => {
  vi.resetModules();
  apiGetMock.mockReset();
});

describe('apps/site runtime locale support (DEC-024)', () => {
  it('surfaces a language added from the ops dashboard, not just the built-in three', async () => {
    apiGetMock.mockResolvedValue(dynamicLocalesResponse);
    const { getRuntimeLocales } = await import('./i18n');
    const runtime = await getRuntimeLocales();
    expect(runtime.locales.map((l) => l.code)).toEqual(['en', 'es']);
  });

  it('falls back to the build-time three-locale list when the API is unreachable', async () => {
    apiGetMock.mockRejectedValue(new Error('network error'));
    const { getRuntimeLocales, ACTIVE_LOCALES } = await import('./i18n');
    const runtime = await getRuntimeLocales();
    expect(runtime.locales.map((l) => l.code).sort()).toEqual([...ACTIVE_LOCALES].sort());
  });

  it('resolves getT/getMessages against a dynamically-added locale instead of collapsing it to en', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/meta/locales') return dynamicLocalesResponse;
      if (path.startsWith('/meta/translations')) return { 'nav.rentACar': 'Alquilar un coche' };
      throw new Error(`unexpected path ${path}`);
    });
    const { getT } = await import('./i18n');
    const t = await getT('es');
    // must resolve as the real 'es' locale, not be silently collapsed to 'en'
    expect(t.locale).toBe('es');
    expect(t.t('nav.rentACar')).toBe('Alquilar un coche');
    // a key with no Spanish override yet still renders (falls through the runtime chain to en)
    expect(t.has('nav.rentACar')).toBe(true);
  });

  it('middleware redirects a locale-less request to a dynamically-added language', async () => {
    apiGetMock.mockResolvedValue(dynamicLocalesResponse);
    const { NextRequest } = await import('next/server');
    const { middleware } = await import('../middleware');
    const req = new NextRequest('https://example.com/search', {
      headers: { 'accept-language': 'es-MX,es;q=0.9' },
    });
    const res = await middleware(req);
    expect(res.headers.get('location')).toBe('https://example.com/es/search');
  });

  it('middleware never redirects a path that already carries the dynamic locale', async () => {
    apiGetMock.mockResolvedValue(dynamicLocalesResponse);
    const { NextRequest } = await import('next/server');
    const { middleware } = await import('../middleware');
    const req = new NextRequest('https://example.com/es/search');
    const res = await middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });
});
