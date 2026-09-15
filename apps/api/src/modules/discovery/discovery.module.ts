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
 *
 * ARCH-GAP (2026-09-15 audit, finding #3): this module wires routes (`DiscoveryController`,
 * `OpsCatalogueController`) and is imported elsewhere, so per CLAUDE.md it should have its own
 * discovery.public.ts — but doesn't. Worse, the four services it bundles (CatalogueService,
 * FleetService, PricingService, AvailabilityService) are consumed cross-module directly rather
 * than through anything this module exports on purpose: booking and rental import
 * AvailabilityService/PricingService straight from their source files, bypassing this module's
 * `exports` array entirely (Nest still resolves them because they're `@Injectable()` providers
 * registered elsewhere in the graph, not because this module intentionally re-shares them). The
 * `apiModuleBoundaries` ESLint rule only blocks imports into a *subdirectory* of another module,
 * not a top-level service file, so none of this lints clean today. Left as-is rather than a
 * partial migration — see the identical note on fleet/pricing/catalogue/availability.service.ts:
 * a real fix spans all five modules together (~15 cross-module call sites: booking, rental, this
 * module's own controllers, and the sub-domains importing each other) and deserves a dedicated PR
 * with its own DI-wiring verification rather than a piecemeal fix bundled into unrelated
 * business-logic findings. Follow-up: add discovery.public.ts (+ fleet/pricing/catalogue/
 * availability.public.ts) re-exporting only what's actually consumed cross-module, then migrate
 * every call site in one pass.
 */
@Module({
  imports: [DomainConfigModule],
  controllers: [DiscoveryController, OpsCatalogueController],
  providers: [CatalogueService, ProductService, FleetService, PricingService, AvailabilityService],
  exports: [CatalogueService, ProductService, FleetService, PricingService, AvailabilityService],
})
export class DiscoveryModule {}
