import { Module } from '@nestjs/common';

import { BrandAssetService } from './brand-asset.service';
import { ConfigVersionService } from './config-version.service';
import { ConfigController } from './config.controller';
import { ConfigPublic } from './config.public';
import { LocationAdminController } from './location-admin.controller';
import { LocationAdminService } from './location-admin.service';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { TranslationService } from './translation.service';

@Module({
  controllers: [LookupController, ConfigController, LocationAdminController],
  providers: [
    LookupService,
    TranslationService,
    ConfigPublic,
    ConfigVersionService,
    BrandAssetService,
    LocationAdminService,
  ],
  exports: [ConfigPublic, LookupService, ConfigVersionService, TranslationService],
})
export class ConfigModule {}
