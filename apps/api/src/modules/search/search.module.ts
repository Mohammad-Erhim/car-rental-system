import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';

import { SearchService } from './search.service';

@ApiTags('ops-search')
@Controller({ path: 'ops', version: '1' })
class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search')
  @Permissions('reservation.read', 'rental.read')
  @ApiOperation({
    operationId: 'ops_search',
    summary: 'Unified search across reservations and rentals (FR-ADM-003)',
  })
  run(
    @CurrentActor() actor: Actor,
    @Query('q') q?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('locationCode') locationCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.search.search(actor, {
      q,
      kind: kind === 'reservation' || kind === 'rental' ? kind : undefined,
      status,
      locationCode,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
