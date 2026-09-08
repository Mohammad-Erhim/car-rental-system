import { zCreateLookupValueRequest, zUpdateLookupValueRequest } from '@carrental/contracts';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor, OptionalAuth } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { LookupService } from './lookup.service';

const zReorder = z.object({
  order: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })).min(1),
});

@ApiTags('reference-data')
@Controller({ path: 'reference-data', version: '1' })
export class LookupController {
  constructor(private readonly lookups: LookupService) {}

  @Get('types')
  @OptionalAuth()
  @ApiOperation({ operationId: 'lookup_listTypes', summary: 'List reference-data catalogue' })
  listTypes(
    @Query('classification') classification?: string,
    @Query('ownerModule') ownerModule?: string,
    @Query('search') search?: string,
  ) {
    return this.lookups.listTypes({ classification, ownerModule, search });
  }

  @Get('types/:code')
  @OptionalAuth()
  getType(@Req() req: Request) {
    return this.lookups.getType(req.params.code!);
  }

  @Get('types/:code/values')
  @OptionalAuth()
  @ApiOperation({ operationId: 'lookup_getValues', summary: 'Dynamic option list for a type' })
  async getValues(@Req() req: Request, @Query() q: Record<string, string>) {
    const res = await this.lookups.getValues(req.params.code!, {
      scopeKey: q.scopeKey,
      locale: q.locale,
      includeInactive: q.includeInactive === 'true',
      activeAt: q.activeAt,
      search: q.search,
    });
    return res;
  }

  @Get('types/:code/values/:valueCode/usage')
  @Permissions('lookup.manage', 'config.read', 'audit.read')
  usage(@Req() req: Request) {
    return this.lookups.usage(req.params.code!, req.params.valueCode!);
  }

  @Post('types/:code/values')
  @Permissions('lookup.manage')
  @ApiOperation({ operationId: 'lookup_createValue', summary: 'Add a reference value' })
  createValue(
    @Req() req: Request,
    @Body(new ZodValidationPipe(zCreateLookupValueRequest))
    body: z.infer<typeof zCreateLookupValueRequest>,
    @CurrentActor() actor: Actor,
  ) {
    return this.lookups.createValue(actor, req.params.code!, body);
  }

  @Post('types/:code/values/:valueId')
  @Permissions('lookup.manage')
  @ApiOperation({ operationId: 'lookup_updateValue', summary: 'Edit a reference value / labels' })
  updateValue(
    @Req() req: Request,
    @Body(new ZodValidationPipe(zUpdateLookupValueRequest))
    body: z.infer<typeof zUpdateLookupValueRequest>,
    @CurrentActor() actor: Actor,
  ) {
    const ifMatch = req.header('If-Match');
    return this.lookups.updateValue(
      actor,
      req.params.code!,
      req.params.valueId!,
      body,
      ifMatch ? Number(ifMatch) : undefined,
    );
  }

  @Post('types/:code/values/:valueId/deactivate')
  @Permissions('lookup.manage')
  deactivate(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.lookups.setActive(actor, req.params.code!, req.params.valueId!, false, {
      force: req.query.force === 'true',
    });
  }

  @Post('types/:code/values/:valueId/restore')
  @Permissions('lookup.manage')
  restore(@Req() req: Request, @CurrentActor() actor: Actor) {
    return this.lookups.setActive(actor, req.params.code!, req.params.valueId!, true);
  }

  @Post('types/:code/reorder')
  @Permissions('lookup.manage')
  reorder(
    @Req() req: Request,
    @Body(new ZodValidationPipe(zReorder)) body: z.infer<typeof zReorder>,
    @CurrentActor() actor: Actor,
  ) {
    return this.lookups.reorder(actor, req.params.code!, body.order);
  }
}
