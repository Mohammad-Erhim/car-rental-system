import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { MetaModule } from './modules/meta/meta.module';
import { buildLoggerParams } from './observability/logger';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ useFactory: buildLoggerParams }),
    ObservabilityModule,
    DatabaseModule,
    MetaModule,
  ],
})
export class AppModule {}
