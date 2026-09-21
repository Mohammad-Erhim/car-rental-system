import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { OptionalAuth } from '../../common/auth/auth.guard';

import { ConfigPublic } from './config.public';

/**
 * Read side of platform config that the storefront and dashboard both need — locations and the
 * operating organization. Write-side config administration is split by concern:
 * `translation.controller` (translations + locales), `branding.controller` (brand assets),
 * `location-admin.controller` (location CRUD).
 */
@ApiTags('config')
@Controller({ path: 'config', version: '1' })
export class ConfigController {
  constructor(private readonly cfg: ConfigPublic) {}

  @Get('locations')
  @OptionalAuth()
  @ApiOperation({ operationId: 'config_listLocations', summary: 'Active rental locations' })
  async listLocations(
    @Query('organizationId') organizationId?: string,
    @Query('locale') locale?: string,
  ) {
    const org = organizationId ? { id: organizationId } : await this.cfg.defaultOrganization();
    if (!org) return [];
    return this.cfg.listLocations(org.id, locale);
  }

  @Get('organization')
  @OptionalAuth()
  organization() {
    return this.cfg.defaultOrganization();
  }
}
