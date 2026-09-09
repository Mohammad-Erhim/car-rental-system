import { Module } from '@nestjs/common';

import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/** Public cookie/privacy consent capture → append-only audit trail (AuditService is @Global). */
@Module({
  controllers: [ConsentController],
  providers: [ConsentService],
})
export class ConsentModule {}
