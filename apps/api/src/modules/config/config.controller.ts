import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor, OptionalAuth } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { ConfigPublic } from './config.public';
import { TranslationService } from './translation.service';

const zUpsertTranslation = z.object({
  namespace: z.string().min(1).max(120),
  key: z.string().min(1).max(200),
  localeCode: z.string().min(2).max(10),
  value: z.string().min(1).max(4000),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});

@ApiTags('config')
@Controller({ path: 'config', version: '1' })
export class ConfigController {
  constructor(
    private readonly cfg: ConfigPublic,
    private readonly translations: TranslationService,
  ) {}

  @Get('locations')
  @OptionalAuth()
  @ApiOperation({ operationId: 'config_listLocations', summary: 'Active rental locations' })
  async listLocations(@Query('organizationId') organizationId?: string) {
    const org = organizationId ? { id: organizationId } : await this.cfg.defaultOrganization();
    if (!org) return [];
    return this.cfg.listLocations(org.id);
  }

  @Get('organization')
  @OptionalAuth()
  organization() {
    return this.cfg.defaultOrganization();
  }

  // --- translation catalogue (SCREEN-OPS-034) ---

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
}
