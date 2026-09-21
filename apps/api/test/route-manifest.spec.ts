import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { beforeAll, describe, expect, it } from 'vitest';

import { AUDIENCE, IS_PUBLIC, OPTIONAL_AUTH } from '../src/common/auth/decorators';
import { ORG_WIDE, PERMISSIONS, STAFF_PERMISSIONS } from '../src/common/auth/permissions.guard';
import { STEP_UP } from '../src/common/auth/step-up.guard';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../src/common/security/rate-limit.decorator';

import { getTestApp } from './helpers/app';

/**
 * The full HTTP surface of the API as one reviewable list — every route WITH its guards. Any route
 * added, moved or removed shows up as a diff here, and so does a guard that is dropped or loosened
 * (a lost `@Permissions`, a removed `@RateLimit`, …): the guard column is read from the same Nest
 * metadata the guards themselves read at request time. Two controllers claiming the same method +
 * path (the risk when `ops/*` routes are spread across five modules) fails the collision check
 * instead of silently shadowing each other. Update the snapshot deliberately when you change a route.
 *
 * Beyond the snapshot, two rules keep the permission model from silently defaulting to "allow":
 *  - every `/ops/**` and `/admin/**` route declares `@Permissions` (a short, justified allow-list
 *    aside), and
 *  - every other route that needs a sign-in but declares no permission is either restricted to one
 *    audience or is an own-data-only route on the list below — anything new must be classified.
 */

interface Route {
  method: string;
  path: string;
  /** compact guard summary, e.g. `auth permissions(any)=reservation.read,reservation.modify` */
  guards: string;
  mode: 'public' | 'optional-auth' | 'auth';
  hasPermissions: boolean;
  hasStaffPermissions: boolean;
  audience: string | null;
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Staff-surface (`/ops`, `/admin`) routes that deliberately carry no `@Permissions`. */
const STAFF_SURFACE_WITHOUT_PERMISSION: Record<string, string> = {
  'GET /api/v1/ops/locations/options':
    'branch dropdown options for any signed-in staff member (audience=staff)',
  'GET /api/v1/ops/payments/mode':
    'public: the customer checkout must know whether card entry is live, simulated or off',
};

/** Signed-in routes with no permission and no single audience: they only ever return or change the
 *  caller's OWN data (or claim a booking the caller holds the link token for). */
const OWN_DATA_ONLY = new Set([
  'POST /api/v1/auth/change-password',
  'GET /api/v1/auth/me',
  'GET /api/v1/auth/me/access',
  'POST /api/v1/auth/step-up',
  'GET /api/v1/bookings/mine',
  'POST /api/v1/bookings/:reference/claim',
  'GET /api/v1/reservations/mine',
  'GET /api/v1/rentals/mine',
]);

function collectExpressRoutes(app: NestExpressApplication): Set<string> {
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    _router?: { stack: RouterLayer[] };
    router?: { stack: RouterLayer[] };
  };
  const stack = (instance._router ?? instance.router)?.stack ?? [];
  const out = new Set<string>();
  for (const layer of stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    // Keep real controller routes only. The framework also registers catch-all `app.all()`
    // layers (the Swagger UI mount at `/api`, the global-prefix redirect) whose "path" is a
    // regex source like `/api$` — those are not part of the API surface.
    if (!path.startsWith('/api/v1/')) continue;
    if (/[$*\\()]/.test(path)) continue;
    // mounted by SwaggerModule outside production — not controller routes, so not part of the manifest
    if (/^\/api\/v1\/(docs|docs-yaml|openapi\.json)(\/|$)/.test(path)) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all') continue;
      out.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return out;
}

const asPaths = (v: unknown): string[] => {
  if (v === undefined) return [''];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  throw new Error(`route-manifest: unsupported path metadata ${String(v)}`);
};

/** Every controller route, with its guards, read from the Nest decorator metadata. */
function collectRoutes(app: NestExpressApplication): Route[] {
  const routes: Route[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const ctrl = wrapper.metatype as unknown as (new () => unknown) | null;
      if (!ctrl) continue;
      const version = Reflect.getMetadata(VERSION_METADATA, ctrl) ?? '1';
      if (version === VERSION_NEUTRAL) continue; // health / metrics — outside `/api/v1`
      const ctrlPaths = asPaths(Reflect.getMetadata(PATH_METADATA, ctrl));
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const methodCode = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (methodCode === undefined) continue; // not a route handler
        const meta = <T>(key: string): T | undefined =>
          (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, ctrl)) as T | undefined;

        const perm = meta<{ actions: string[]; mode: 'any' | 'all' }>(PERMISSIONS);
        const staff = meta<{ actions: string[] }>(STAFF_PERMISSIONS);
        const rate = meta<RateLimitOptions>(RATE_LIMIT_KEY);
        const audience = meta<string>(AUDIENCE) ?? null;
        const mode = meta<boolean>(IS_PUBLIC)
          ? 'public'
          : meta<boolean>(OPTIONAL_AUTH)
            ? 'optional-auth'
            : 'auth';
        const guards = [
          mode,
          audience ? `audience=${audience}` : '',
          perm?.actions.length ? `permissions(${perm.mode})=${perm.actions.join(',')}` : '',
          staff?.actions.length ? `staff-permissions=${staff.actions.join(',')}` : '',
          meta<boolean>(ORG_WIDE) ? 'org-wide' : '',
          meta<boolean>(STEP_UP) ? 'step-up' : '',
          rate ? `rate-limit=${rate.preset ?? `${rate.limit}/${rate.windowSec}s`}` : '',
        ]
          .filter(Boolean)
          .join(' ');

        for (const cp of ctrlPaths) {
          for (const mp of asPaths(Reflect.getMetadata(PATH_METADATA, handler))) {
            const path = `/api/v${version}/${cp}/${mp}`.replace(/\/+/g, '/').replace(/\/$/, '');
            if (/[$*\\()]/.test(path)) continue; // catch-alls such as `assets/*`
            routes.push({
              method: RequestMethod[methodCode]!,
              path,
              guards,
              mode,
              hasPermissions: !!perm?.actions.length,
              hasStaffPermissions: !!staff?.actions.length,
              audience,
            });
          }
        }
      }
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

const key = (r: Pick<Route, 'method' | 'path'>) => `${r.method} ${r.path}`;

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

  it('lists exactly the routes Express serves (the guard column cannot drift from the router)', () => {
    expect([...new Set(routes.map(key))].sort()).toEqual([...collectExpressRoutes(app)].sort());
  });

  it('has no method + path collisions between controllers', () => {
    const seen = new Map<string, number>();
    for (const r of routes) seen.set(key(r), (seen.get(key(r)) ?? 0) + 1);
    const collisions = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(collisions).toEqual([]);
  });

  it('keeps the ops surface on the /api/v1/ops prefix', () => {
    const opsRoutes = routes.filter((r) => r.path.startsWith('/api/v1/ops/'));
    expect(opsRoutes.length).toBeGreaterThan(20);
  });

  it('every /ops and /admin route declares @Permissions (bar a short, justified allow-list)', () => {
    const missing = routes
      .filter((r) => /^\/api\/v1\/(ops|admin)\//.test(r.path))
      .filter((r) => !r.hasPermissions && !(key(r) in STAFF_SURFACE_WITHOUT_PERMISSION))
      .map((r) => `${key(r)}  [${r.guards}]`);
    expect(
      missing,
      'A staff-surface route needs @Permissions(...) — the guard lets any signed-in user through a route that declares none.',
    ).toEqual([]);
  });

  it('every signed-in route without a permission is restricted to one audience, or is own-data-only', () => {
    const unclassified = routes
      .filter((r) => r.mode === 'auth')
      .filter((r) => !r.hasPermissions && !r.hasStaffPermissions && !r.audience)
      .filter((r) => !OWN_DATA_ONLY.has(key(r)))
      .map((r) => key(r));
    expect(
      unclassified,
      'A route that only needs a sign-in is reachable by every kind of account. Give it @RequireAudience, ' +
        '@Permissions (staff-only) or @StaffPermissions (customers AND staff — DEC-038); list it in OWN_DATA_ONLY ' +
        'only if it can never touch anyone but the caller.',
    ).toEqual([]);
  });

  it('routes that let a customer AND staff reach the same record demand a staff permission', () => {
    const dual = [
      'GET /api/v1/reservations/:reference',
      'GET /api/v1/reservations/:reference/history',
      'GET /api/v1/reservations/:reference/invoices',
      'GET /api/v1/reservations/:reference/invoices/:number',
      'POST /api/v1/reservations/:reference/cancel',
      'POST /api/v1/reservations/:reference/modify',
      'GET /api/v1/rentals/:reference',
      'POST /api/v1/rentals/:reference/extend',
      'GET /api/v1/bookings/:reference',
    ];
    const byKey = new Map(routes.map((r) => [key(r), r]));
    const unguarded = dual.filter((k) => !byKey.get(k)?.hasStaffPermissions);
    expect(unguarded).toEqual([]);
  });

  it('matches the committed manifest', () => {
    const manifest = routes
      .map((r) => `${r.method.padEnd(6)} ${r.path}  ::  ${r.guards}`)
      .join('\n');
    expect(manifest).toMatchSnapshot();
  });
});
