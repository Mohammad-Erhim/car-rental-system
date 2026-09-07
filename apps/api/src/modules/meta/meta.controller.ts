import { zBuildInfo, zHealthSummary, zLocalesResponse } from '@carrental/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';

import { MetaService } from './meta.service';

class LocalesResponseDto extends createZodDto(zLocalesResponse) {}
class BuildInfoDto extends createZodDto(zBuildInfo) {}
class HealthSummaryDto extends createZodDto(zHealthSummary) {}

@ApiTags('meta')
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
