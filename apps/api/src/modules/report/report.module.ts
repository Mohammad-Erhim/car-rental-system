import { Module } from '@nestjs/common';

import { ConfigModule as DomainConfigModule } from '../config/config.module';

import { ReportController } from './report.controller';
import { ReportService } from './report.service';

/**
 * STAGE-006 — Administration & reporting. Versioned config with preview + approval-separation +
 * publish (never mutates a prior accepted version), a whitelisted reports hub with location-scope
 * filtering + CSV export + schedules, and an audit viewer.
 */
@Module({
  imports: [DomainConfigModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
