import 'reflect-metadata';

import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { permissionAction } from '../../database/schema/iam';

import { PERMISSIONS } from './permissions.guard';

/**
 * Keeps the permission catalogue honest. The `@Permissions(...)` decorators are the source of
 * truth for what can be governed; the `permission_action` table is what the role editor and the
 * matrix show. At boot every action named by a decorator is guaranteed to exist in the catalogue
 * (a new endpoint can never reference an action nobody can grant), and a test asserts the same so
 * drift fails CI instead of silently locking a feature.
 */
@Injectable()
export class PermissionCatalogueService implements OnApplicationBootstrap {
  private readonly logger = new Logger('PermissionCatalogue');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly discovery: DiscoveryService,
  ) {}

  /** Every action named by a `@Permissions` decorator on a controller or handler. */
  discoverActions(): string[] {
    const found = new Set<string>();
    const read = (target: unknown) => {
      if (!target) return;
      const meta = Reflect.getMetadata(PERMISSIONS, target as object) as
        | { actions: string[] }
        | undefined;
      for (const a of meta?.actions ?? []) found.add(a);
    };
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      read(metatype);
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = proto[name];
        if (typeof handler === 'function') read(handler);
      }
    }
    return [...found].sort();
  }

  async onApplicationBootstrap(): Promise<void> {
    const wanted = this.discoverActions();
    if (!wanted.length) return;
    const known = new Set(
      (await this.db.select({ code: permissionAction.code }).from(permissionAction)).map(
        (r) => r.code,
      ),
    );
    const missing = wanted.filter((a) => !known.has(a));
    for (const code of missing) {
      await this.db
        .insert(permissionAction)
        .values({
          code,
          group: code.split('.')[0] ?? 'other',
          riskLevel: 'normal',
          description: 'Added automatically — describe this permission in the seed',
        })
        .onConflictDoNothing();
      this.logger.warn(
        `permission "${code}" is used by an endpoint but was missing from the catalogue — added`,
      );
    }
  }
}
