import { createHash } from 'node:crypto';

import {
  zBrandingResponse,
  zBuildInfo,
  zHealthSummary,
  zLocalesResponse,
  zSeoResponse,
} from '@carrental/contracts';
import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';

import { Public } from '../../common/auth/decorators';

import { MetaService } from './meta.service';

class LocalesResponseDto extends createZodDto(zLocalesResponse) {}
class BuildInfoDto extends createZodDto(zBuildInfo) {}
class HealthSummaryDto extends createZodDto(zHealthSummary) {}
class BrandingResponseDto extends createZodDto(zBrandingResponse) {}
class SeoResponseDto extends createZodDto(zSeoResponse) {}

@ApiTags('meta')
@Public()
@Controller({ path: 'meta', version: '1' })
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get('locales')
  @ApiOperation({
    operationId: 'meta_getLocales',
    summary: 'Enabled locales, default, and fallbacks',
  })
  @ApiOkResponse({ type: LocalesResponseDto })
  getLocales() {
    return this.meta.locales();
  }

  @Get('build')
  @ApiOperation({ operationId: 'meta_getBuild', summary: 'Safe build/version metadata' })
  @ApiOkResponse({ type: BuildInfoDto })
  getBuild() {
    return this.meta.build();
  }

  @Get('branding')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    operationId: 'meta_getBranding',
    summary: 'Published brand/theme config for both frontends (DEC-025)',
  })
  @ApiOkResponse({ type: BrandingResponseDto })
  async getBranding(@Res({ passthrough: true }) res: Response) {
    const body = await this.meta.branding();
    const etag = `"brand-${body.revision}-${createHash('sha1')
      .update(JSON.stringify(body.config))
      .digest('hex')
      .slice(0, 16)}"`;
    res.setHeader('ETag', etag);
    return body;
  }

  @Get('seo')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    operationId: 'meta_getSeo',
    summary: 'Published SEO config for the public site (SRS-ADM-006)',
  })
  @ApiOkResponse({ type: SeoResponseDto })
  async getSeo(@Res({ passthrough: true }) res: Response) {
    const body = await this.meta.seo();
    const etag = `"seo-${body.revision}-${createHash('sha1')
      .update(JSON.stringify(body.config))
      .digest('hex')
      .slice(0, 16)}"`;
    res.setHeader('ETag', etag);
    return body;
  }

  @Get('health-summary')
  @ApiOperation({
    operationId: 'meta_getHealthSummary',
    summary: 'Coarse system status for the UI status bar',
  })
  @ApiOkResponse({ type: HealthSummaryDto })
  getHealthSummary() {
    return this.meta.healthSummary();
  }
}
