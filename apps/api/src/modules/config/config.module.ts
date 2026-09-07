import { Module } from '@nestjs/common';

import { ConfigController } from './config.controller';
import { ConfigPublic } from './config.public';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { TranslationService } from './translation.service';

@Module({
  controllers: [LookupController, ConfigController],
  providers: [LookupService, TranslationService, ConfigPublic],
  exports: [ConfigPublic, LookupService],
})
export class ConfigModule {}
