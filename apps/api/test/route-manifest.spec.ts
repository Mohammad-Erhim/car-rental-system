import type { NestExpressApplication } from '@nestjs/platform-express';
import { beforeAll, describe, expect, it } from 'vitest';

import { getTestApp } from './helpers/app';

/**
 * The full HTTP surface of the API as one reviewable list. Any route added, moved, or removed
 * shows up as a diff here — and two controllers claiming the same method + path (the risk when
 * `ops/*` routes are spread across five modules) fails the collision check instead of silently
 * shadowing each other. Update the inline snapshot deliberately when you change a route.
 */

interface Route {
  method: string;
  path: string;
}

function collectRoutes(app: NestExpressApplication): Route[] {
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    _router?: { stack: RouterLayer[] };
    router?: { stack: RouterLayer[] };
  };
  const stack = (instance._router ?? instance.router)?.stack ?? [];
  const routes: Route[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    // Keep real controller routes only. The framework also registers catch-all `app.all()`
    // layers (the Swagger UI mount at `/api`, the global-prefix redirect) whose "path" is a
    // regex source like `/api$` — those are not part of the API surface.
    if (!path.startsWith('/api/v1/')) continue;
    if (/[$*\\()]/.test(path)) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all') continue;
      routes.push({ method: method.toUpperCase(), path });
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('HTTP route manifest', () => {
  let app: NestExpressApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await getTestApp();
    routes = collectRoutes(app);
  });

  it('exposes routes (router introspection works on this Express version)', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('has no method + path collisions between controllers', () => {
    const seen = new Map<string, number>();
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const collisions = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(collisions).toEqual([]);
  });

  it('keeps the ops surface on the /api/v1/ops prefix', () => {
    const opsRoutes = routes.filter((r) => r.path.startsWith('/api/v1/ops/'));
    expect(opsRoutes.length).toBeGreaterThan(20);
  });

  it('matches the committed manifest', () => {
    const manifest = routes.map((r) => `${r.method.padEnd(6)} ${r.path}`).join('\n');
    expect(manifest).toMatchSnapshot();
  });
});
