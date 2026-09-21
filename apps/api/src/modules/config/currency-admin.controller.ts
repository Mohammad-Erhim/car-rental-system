import { zEnableCurrencyRequest } from '@carrental/contracts';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { CurrencyService } from './currency.service';

/**
 * SCREEN-OPS — Currencies (DEC-036). The dashboard's list of currencies the business sells in:
 * add one from the supported catalogue, choose the default, disable one. Everything downstream —
 * the rate-plan and extras pickers, the customer's currency switcher, what a search may quote —
 * reads the same list, so a change here needs no code change and no redeploy.
 */
@ApiTags('ops-config')
@Controller({ path: 'ops/config/currencies', version: '1' })
export class CurrencyAdminController {
  constructor(private readonly currencies: CurrencyService) {}

  @Get()
  @OrgWide()
  @Permissions('lookup.manage', 'config.read')
  @ApiOperation({ operationId: 'currency_overview', summary: 'Enabled and available currencies' })
  overview(@Query('locale') locale?: string) {
    return this.currencies.adminOverview(locale);
  }

  @Post()
  @OrgWide()
  @Permissions('lookup.manage')
  @ApiOperation({ operationId: 'currency_enable', summary: 'Enable a supported currency' })
  enable(
    @Body(new ZodValidationPipe(zEnableCurrencyRequest))
    body: z.infer<typeof zEnableCurrencyRequest>,
    @CurrentActor() actor: Actor,
  ) {
    return this.currencies.enable(actor, body.code, { makeDefault: body.makeDefault });
  }

  @Post(':code/default')
  @OrgWide()
  @Permissions('lookup.manage')
  @ApiOperation({ operationId: 'currency_setDefault', summary: 'Make a currency the default' })
  setDefault(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.currencies.setDefault(actor, code);
  }

  @Post(':code/disable')
  @OrgWide()
  @Permissions('lookup.manage')
  @ApiOperation({ operationId: 'currency_disable', summary: 'Disable a currency for new prices' })
  disable(
    @Param('code') code: string,
    @Query('force') force: string | undefined,
    @CurrentActor() actor: Actor,
  ) {
    return this.currencies.disable(actor, code, { force: force === 'true' });
  }
}
