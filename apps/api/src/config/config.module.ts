import { Global, Module } from '@nestjs/common';

import { loadEnv, type Env } from './env.schema';
import { loadDotEnv } from './load-dotenv';

export const ENV = Symbol('ENV');

/** Loads .env (dev only) then validates the merged environment once. */
function bootstrapEnv(): Env {
  loadDotEnv();
  return loadEnv();
}

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: bootstrapEnv }],
  exports: [ENV],
})
export class ConfigModule {}
