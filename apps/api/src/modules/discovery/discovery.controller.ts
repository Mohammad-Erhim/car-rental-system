import { zAvailabilitySearchRequest, zCreateQuoteRequest } from '@carrental/contracts';
import { Body, Controller, Get, Param, Post, Query, Req, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { AppError } from '../../common/app-error';
import { MaybeCurrentActor, OptionalAuth } from '../../common/auth/auth.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { organization } from '../../database/schema/org';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ProductService } from '../catalogue/product.service';
import { PricingService } from '../pricing/pricing.service';

@ApiTags('discovery')
@Controller({ version: '1' })
export class DiscoveryController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly catalogue: CatalogueService,
    private readonly products: ProductService,
    private readonly pricing: PricingService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get('catalogue/products')
  @OptionalAuth()
  @ApiOperation({
    operationId: 'catalogue_listProducts',
    summary: 'Extras & protection products available for a category + location',
  })
  listProducts(@Query('category') category: string, @Query('location') location: string) {
    return this.products.availableFor(category, location);
  }

  @Get('catalogue/categories')
  @OptionalAuth()
  @ApiOperation({ operationId: 'catalogue_listCategories', summary: 'Bookable vehicle categories' })
  async categories(@Query('includeInactive') includeInactive?: string) {
    return this.catalogue.listCategories({ includeInactive: includeInactive === 'true' });
  }

  @Get('catalogue/categories/:code')
  @OptionalAuth()
  category(@Param('code') code: string) {
    return this.catalogue.getCategory(code);
  }

  @Post('discovery/search')
  @OptionalAuth()
  @ApiOperation({ operationId: 'discovery_search', summary: 'Real-time availability for a window' })
  async search(
    @Body(new ZodValidationPipe(zAvailabilitySearchRequest))
    body: z.infer<typeof zAvailabilitySearchRequest>,
  ) {
    return this.availability.search({
      pickupLocationCode: body.pickupLocationCode,
      returnLocationCode: body.returnLocationCode,
      pickupAt: new Date(body.pickupAt),
      returnAt: new Date(body.returnAt),
      categoryCode: body.categoryCode,
    });
  }

  @Post('discovery/quote')
  @OptionalAuth()
  @ApiOperation({
    operationId: 'discovery_quote',
    summary: 'Itemised quote + optional checkout hold',
  })
  async quote(
    @Body(new ZodValidationPipe(zCreateQuoteRequest)) body: z.infer<typeof zCreateQuoteRequest>,
    @Req() req: Request,
    @MaybeCurrentActor() actor?: Actor,
  ) {
    const [org] = await this.db.select().from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });

    const pickupAt = new Date(body.pickupAt);
    const returnAt = new Date(body.returnAt);
    const returnCode = body.returnLocationCode ?? body.pickupLocationCode;

    // hours + window validation via search (reuses the same rules)
    const check = await this.availability.search({
      pickupLocationCode: body.pickupLocationCode,
      returnLocationCode: returnCode,
      pickupAt,
      returnAt,
      categoryCode: body.categoryCode,
    });
    const blocking = check.notices.find(
      (n) =>
        n.code === 'invalid_window' || n.code.startsWith('pickup_') || n.code.startsWith('return_'),
    );
    if (blocking) {
      throw AppError.businessRule(blocking.message, { reason: blocking.code });
    }

    const pickupYmd = check.pickupAt.slice(0, 10);
    const priced = await this.pricing.priceWindow(
      body.categoryCode,
      body.pickupLocationCode,
      pickupAt,
      returnAt,
      pickupYmd,
    );
    if (!priced) {
      throw AppError.businessRule('No rate is published for that vehicle class and dates', {
        reason: 'no_rate_plan',
      });
    }

    let holdInfo: { id: string; expiresAt: string; unitPinned: boolean } | null = null;
    if (body.hold) {
      holdInfo = await this.availability.checkAndHold({
        actor: actor ?? null,
        organizationId: org.id,
        categoryCode: body.categoryCode,
        pickupLocationCode: body.pickupLocationCode,
        returnLocationCode: returnCode,
        pickupAt,
        returnAt,
        holderKey: actor?.accountId ?? body.holderKey ?? `anon-${req.ip ?? 'x'}-${Date.now()}`,
      });
    }

    const persisted = await this.pricing.persistQuote(actor ?? null, {
      categoryCode: body.categoryCode,
      pickupLocationCode: body.pickupLocationCode,
      returnLocationCode: returnCode,
      pickupAt,
      returnAt,
      priced,
      holdId: holdInfo?.id ?? null,
    });

    return { ...persisted, hold: holdInfo };
  }

  @Get('discovery/quotes/:reference')
  @OptionalAuth()
  async getQuote(@Param('reference') reference: string) {
    const q = await this.pricing.getQuote(reference);
    return { ...q, hold: null };
  }
}
