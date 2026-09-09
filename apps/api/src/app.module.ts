import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './common/auth/auth.module';
import { CommonModule } from './common/common.module';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { BookingModule } from './modules/booking/booking.module';
import { ConfigModule as DomainConfigModule } from './modules/config/config.module';
import { ConsentModule } from './modules/consent/consent.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { IamModule } from './modules/iam/iam.module';
import { MetaModule } from './modules/meta/meta.module';
import { NotifyModule } from './modules/notify/notify.module';
import { RentalModule } from './modules/rental/rental.module';
import { ReportModule } from './modules/report/report.module';
import { SearchModule } from './modules/search/search.module';
import { buildLoggerParams } from './observability/logger';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ useFactory: buildLoggerParams }),
    ObservabilityModule,
    DatabaseModule,
    CommonModule,
    AuthModule,
    NotifyModule,
    IamModule,
    DomainConfigModule,
    AdminModule,
    CustomerModule,
    DiscoveryModule,
    BookingModule,
    RentalModule,
    ReportModule,
    SearchModule,
    MetaModule,
    ConsentModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
