import { describe, expect, it } from 'vitest';

import { resolveSiteOrigin } from './site-origin';

const loc = (port: string) => ({
  origin: `http://localhost${port ? `:${port}` : ''}`,
  port,
  protocol: 'http:',
  hostname: 'localhost',
});

describe('resolveSiteOrigin', () => {
  it('prefers the configured URL, without a trailing slash', () => {
    expect(resolveSiteOrigin('https://site.test/', loc('3100'))).toBe('https://site.test');
  });

  it('points at the site dev port when the dashboard is opened on its own dev port', () => {
    expect(resolveSiteOrigin(undefined, loc('3100'))).toBe('http://localhost:3000');
  });

  it('is the same origin everywhere else (single-origin setups)', () => {
    expect(resolveSiteOrigin(undefined, loc('3000'))).toBe('http://localhost:3000');
    expect(resolveSiteOrigin(undefined, loc(''))).toBe('http://localhost');
  });
});
