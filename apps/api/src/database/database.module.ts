import { Global, Module, type OnModuleDestroy } from '@nestjs/common';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';

import { createDb, type Database, type DbHandle } from './drizzle';

export const DB = Symbol('DB');
export const DB_HANDLE = Symbol('DB_HANDLE');

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [ENV],
      useFactory: (env: Env): DbHandle =>
        createDb(
          env.NODE_ENV === 'test' && env.DATABASE_URL_TEST
            ? env.DATABASE_URL_TEST
            : env.DATABASE_URL,
        ),
    },
    {
      provide: DB,
      inject: [DB_HANDLE],
      useFactory: (handle: DbHandle): Database => handle.db,
    },
  ],
  exports: [DB, DB_HANDLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor() {}
  async onModuleDestroy(): Promise<void> {
    // handled by the app's beforeExit hook; nothing required here
  }
}
