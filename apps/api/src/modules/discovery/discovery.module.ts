import { Module } from '@nestjs/common';

import { AvailabilityService } from '../availability/availability.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ProductService } from '../catalogue/product.service';
import { ConfigModule as DomainConfigModule } from '../config/config.module';
import { FleetService } from '../fleet/fleet.service';
import { PricingService } from '../pricing/pricing.service';

import { DiscoveryController } from './discovery.controller';
import { OpsCatalogueController } from './ops-catalogue.controller';

/**
 * STAGE-002 — Discovery & quote. Bundles catalogue, fleet (read), availability engine, and
 * pricing behind the customer discovery surface and the ops catalogue/pricing/holds surface.
 */
@Module({
  imports: [DomainConfigModule],
  controllers: [DiscoveryController, OpsCatalogueController],
  providers: [CatalogueService, ProductService, FleetService, PricingService, AvailabilityService],
  exports: [CatalogueService, ProductService, FleetService, PricingService, AvailabilityService],
})
export class DiscoveryModule {}
