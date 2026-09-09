import { Module } from '@nestjs/common';

import { ConsentAdminController } from './consent-admin.controller';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/**
 * Cookie/privacy consent: a public capture endpoint (`POST /api/v1/consent`) that writes to the
 * append-only audit trail, plus an ops view over it (`GET /api/v1/ops/consent/log`). The banner
 * config itself rides the generic `config_version` workflow (kind `consent`) via ReportModule.
 */
@Module({
  controllers: [ConsentController, ConsentAdminController],
  providers: [ConsentService],
})
export class ConsentModule {}
