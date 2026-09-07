import { Module } from '@nestjs/common';

import { BrandAssetService } from './brand-asset.service';
import { ConfigVersionService } from './config-version.service';
import { ConfigController } from './config.controller';
import { ConfigPublic } from './config.public';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { TranslationService } from './translation.service';

@Module({
  controllers: [LookupController, ConfigController],
  providers: [
    LookupService,
    TranslationService,
    ConfigPublic,
    ConfigVersionService,
    BrandAssetService,
  ],
  exports: [ConfigPublic, LookupService, ConfigVersionService, TranslationService],
})
export class ConfigModule {}
