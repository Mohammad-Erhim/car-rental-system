import { Module } from '@nestjs/common';

import { BrandAssetService } from './brand-asset.service';
import { BrandingController } from './branding.controller';
import { ConfigVersionService } from './config-version.service';
import { ConfigController } from './config.controller';
import { ConfigPublic } from './config.public';
import { CurrencyAdminController } from './currency-admin.controller';
import { CurrencyService } from './currency.service';
import { LocaleRepo } from './locale.repo';
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
    CurrencyAdminController,
  ],
  providers: [
    LookupService,
    TranslationService,
    ConfigPublic,
    ConfigVersionService,
    BrandAssetService,
    LocationAdminService,
    LocaleRepo,
    CurrencyService,
  ],
  exports: [ConfigPublic, LookupService, ConfigVersionService, TranslationService, LocaleRepo],
})
export class ConfigModule {}
