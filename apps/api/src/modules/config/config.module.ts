import { Module } from '@nestjs/common';

import { BrandAssetService } from './brand-asset.service';
import { BrandingController } from './branding.controller';
import { ConfigVersionService } from './config-version.service';
import { ConfigController } from './config.controller';
import { ConfigPublic } from './config.public';
import { LocationAdminController } from './location-admin.controller';
import { LocationAdminService } from './location-admin.service';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

/**
 * Platform configuration. Several concerns live here on purpose — reference-data lookups,
 * locations, translations/locales, branding assets and config versioning — because they share
 * one permission domain (`config.read` / `config.publish`) and one cross-module public surface
 * (`ConfigPublic`). Each concern has its own controller + service file; see the per-file docs.
 */
@Module({
  controllers: [
    LookupController,
    ConfigController,
    TranslationController,
    BrandingController,
    LocationAdminController,
  ],
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
