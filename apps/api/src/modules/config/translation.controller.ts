import { Body, Controller, Delete, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { TranslationService } from './translation.service';

const zUpsertTranslation = z.object({
  namespace: z.string().min(1).max(120),
  key: z.string().min(1).max(200),
  localeCode: z.string().min(2).max(10),
  value: z.string().min(1).max(4000),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});

const zUpsertLocale = z.object({
  code: z.string().min(2).max(12),
  nativeName: z.string().min(1).max(80),
  englishName: z.string().min(1).max(80),
  direction: z.enum(['ltr', 'rtl']),
  fallbackChain: z.array(z.string().min(2).max(12)).max(5).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/** SCREEN-OPS-034 · SRS-I18N-001 · DEC-024 — translation catalogue + locale administration. */
@ApiTags('config')
@Controller({ path: 'config', version: '1' })
export class TranslationController {
  constructor(private readonly translations: TranslationService) {}

  // --- translation catalogue ---

  @Get('translations/completeness')
  @Permissions('config.read', 'config.publish')
  completeness() {
    return this.translations.completeness();
  }

  @Get('translations')
  @Permissions('config.read', 'config.publish')
  list(@Query('namespace') namespace: string, @Query('locale') locale: string) {
    return this.translations.list(namespace, locale);
  }

  @Post('translations')
  @Permissions('config.publish', 'lookup.manage')
  upsert(
    @Body(new ZodValidationPipe(zUpsertTranslation)) body: z.infer<typeof zUpsertTranslation>,
    @CurrentActor() actor: Actor,
  ) {
    return this.translations.upsert(actor, body);
  }

  @Post('translations/:namespace/:locale/publish')
  @Permissions('config.publish')
  publish(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.translations.publish(actor, req.params.namespace!, req.params.locale!);
  }

  // --- locale administration ---

  @Get('locales')
  @Permissions('config.read', 'config.publish')
  @ApiOperation({ operationId: 'config_listLocalesAdmin', summary: 'All locales incl. inactive' })
  listLocalesAdmin() {
    return this.translations.listLocales();
  }

  @Post('locales')
  @Permissions('config.publish')
  @ApiOperation({ operationId: 'config_upsertLocale', summary: 'Add or edit a locale' })
  upsertLocale(
    @Body(new ZodValidationPipe(zUpsertLocale)) body: z.infer<typeof zUpsertLocale>,
    @CurrentActor() actor: Actor,
  ) {
    return this.translations.upsertLocale(actor, body);
  }

  @Delete('locales/:code')
  @Permissions('config.publish')
  @ApiOperation({ operationId: 'config_removeLocale', summary: 'Delete an unused locale' })
  removeLocale(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.translations.removeLocale(actor, req.params.code!);
  }

  @Post('locales/:code/activate')
  @Permissions('config.publish')
  activateLocale(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.translations.setLocaleActive(actor, req.params.code!, true);
  }

  @Post('locales/:code/deactivate')
  @Permissions('config.publish')
  deactivateLocale(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.translations.setLocaleActive(actor, req.params.code!, false);
  }

  @Post('locales/:code/default')
  @Permissions('config.publish')
  makeDefaultLocale(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.translations.setDefaultLocale(actor, req.params.code!, {
      force: req.query.force === 'true',
    });
  }
}
