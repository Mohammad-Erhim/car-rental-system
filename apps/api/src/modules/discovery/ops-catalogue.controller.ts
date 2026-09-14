import { zUpsertVehicleCategory, zUpsertVehicleFeature } from '@carrental/contracts';
import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ProductService } from '../catalogue/product.service';
import { FleetService } from '../fleet/fleet.service';
import { PricingService } from '../pricing/pricing.service';

const zRatePlan = z.object({
  id: z.string().uuid().optional(),
  categoryCode: z.string().min(2).max(40),
  locationCode: z.string().max(20).nullable().optional(),
  currency: z.string().length(3).optional(),
  name: z.string().min(1).max(120),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  baseDayMinor: z.number().int().positive(),
  hourMinor: z.number().int().min(0).optional(),
  minDurationHours: z.number().int().min(1).optional(),
  maxDurationHours: z.number().int().min(1).nullable().optional(),
  taxBps: z.number().int().min(0).max(10000).optional(),
  fees: z
    .array(
      z.object({
        code: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore'),
        label: z.string().min(1).max(120),
        amountMinor: z.number().int().min(0),
        taxable: z.boolean().optional(),
      }),
    )
    .optional(),
  tiers: z
    .array(z.object({ minHours: z.number().int().min(1), dayMinor: z.number().int().min(1) }))
    .optional(),
});

const zBlock = z
  .object({
    unitId: z.string().uuid(),
    kind: z.enum(['maintenance', 'damage', 'admin_block', 'transfer']).optional(),
    reasonCode: z.string().max(60).optional(),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((b) => !b.endAt || new Date(b.endAt) > new Date(b.startAt), {
    path: ['endAt'],
    message: 'The block end must be after its start',
  });

const zTransfer = z.object({
  toLocationCode: z.string().min(1).max(20),
  note: z.string().max(1000).optional(),
});

const zUnitImport = z.object({
  csv: z.string().min(1).max(2_000_000),
  commit: z.boolean().optional(),
});

const zCreateUnit = z.object({
  categoryCode: z.string().min(2).max(40),
  locationCode: z.string().min(1).max(20),
  vin: z
    .string()
    .trim()
    .min(11)
    .max(17)
    .regex(/^[A-Za-z0-9]+$/, 'letters and digits only'),
  plate: z.string().trim().min(1).max(20),
  year: z
    .string()
    .regex(/^(19|20)\d{2}$/)
    .optional(),
  make: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  colour: z.string().max(40).optional(),
  imageRef: z.string().max(300).nullable().optional(),
});

const zUpdateUnit = zCreateUnit.omit({ locationCode: true }).partial();

const zProduct = z.object({
  code: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(120),
  kind: z.enum(['extra', 'protection']),
  unitPriceMinor: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  pricingUnit: z.enum(['per_rental', 'per_day']).optional(),
  taxable: z.boolean().optional(),
  maxQuantity: z.number().int().min(1).max(20).optional(),
  categoryScope: z.array(z.string().max(40)).max(50).optional(),
  locationScope: z.array(z.string().max(20)).max(50).optional(),
  sortOrder: z.number().int().optional(),
});

@ApiTags('ops-catalogue')
@Controller({ path: 'ops', version: '1' })
export class OpsCatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly products: ProductService,
    private readonly fleet: FleetService,
    private readonly pricing: PricingService,
    private readonly availability: AvailabilityService,
  ) {}

  // --- extras & protection products (SCREEN-OPS-027 / FR-ADM-006) ---

  @Get('catalogue/products')
  @Permissions('catalogue.read', 'config.read')
  listProducts() {
    return this.products.list();
  }

  @Post('catalogue/products')
  @Permissions('catalogue.manage')
  upsertProduct(
    @Body(new ZodValidationPipe(zProduct)) body: z.infer<typeof zProduct>,
    @CurrentActor() actor: Actor,
  ) {
    return this.products.upsert(actor, body);
  }

  @Post('catalogue/products/:code/deactivate')
  @Permissions('catalogue.manage')
  deactivateProduct(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.products.setActive(actor, code, false);
  }

  @Post('catalogue/products/:code/restore')
  @Permissions('catalogue.manage')
  restoreProduct(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.products.setActive(actor, code, true);
  }

  // --- catalogue (SCREEN-OPS-013/025) ---

  @Get('catalogue/categories')
  @Permissions('catalogue.read', 'config.read')
  listCategories() {
    return this.catalogue.listCategories({ includeInactive: true });
  }

  @Get('catalogue/features')
  @Permissions('catalogue.read', 'config.read')
  listFeatures() {
    return this.catalogue.listFeatures({ includeInactive: true });
  }

  @Post('catalogue/categories')
  @Permissions('catalogue.manage')
  upsertCategory(
    @Body(new ZodValidationPipe(zUpsertVehicleCategory))
    body: z.infer<typeof zUpsertVehicleCategory>,
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ) {
    const ifMatch = req.header('If-Match');
    return this.catalogue.upsertCategory(actor, body, ifMatch ? Number(ifMatch) : undefined);
  }

  @Post('catalogue/categories/:code/deactivate')
  @Permissions('catalogue.manage')
  deactivateCategory(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.catalogue.setCategoryActive(actor, code, false);
  }

  @Post('catalogue/categories/:code/restore')
  @Permissions('catalogue.manage')
  restoreCategory(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.catalogue.setCategoryActive(actor, code, true);
  }

  @Post('catalogue/features')
  @Permissions('catalogue.manage')
  upsertFeature(
    @Body(new ZodValidationPipe(zUpsertVehicleFeature))
    body: z.infer<typeof zUpsertVehicleFeature>,
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ) {
    const ifMatch = req.header('If-Match');
    return this.catalogue.upsertFeature(actor, body, ifMatch ? Number(ifMatch) : undefined);
  }

  @Post('catalogue/features/:code/deactivate')
  @Permissions('catalogue.manage')
  deactivateFeature(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.catalogue.setFeatureActive(actor, code, false);
  }

  @Post('catalogue/features/:code/restore')
  @Permissions('catalogue.manage')
  restoreFeature(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.catalogue.setFeatureActive(actor, code, true);
  }

  // --- fleet inventory + operations (SCREEN-OPS-013 / 017 / 018) ---

  @Get('fleet/units')
  @Permissions('fleet.read', 'fleet.manage')
  listUnits(
    @CurrentActor() actor: Actor,
    @Query('locationCode') locationCode?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('state') state?: string,
  ) {
    return this.fleet.listUnits(actor, { locationCode, categoryCode, state });
  }

  @Get('fleet/blocks')
  @Permissions('fleet.read', 'fleet.manage')
  listBlocks(
    @CurrentActor() actor: Actor,
    @Query('unitId') unitId?: string,
    @Query('status') status?: string,
  ) {
    return this.fleet.listBlocks(actor, { unitId, status });
  }

  @Post('fleet/blocks')
  @Permissions('fleet.manage')
  addBlock(
    @Body(new ZodValidationPipe(zBlock)) body: z.infer<typeof zBlock>,
    @CurrentActor() actor: Actor,
  ) {
    return this.fleet.addBlock(actor, body);
  }

  @Post('fleet/blocks/:id/release')
  @Permissions('fleet.manage')
  releaseBlock(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.fleet.releaseBlock(actor, id);
  }

  @Post('fleet/units/:id/transfer')
  @Permissions('fleet.manage')
  transferUnit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zTransfer)) body: z.infer<typeof zTransfer>,
    @CurrentActor() actor: Actor,
  ) {
    return this.fleet.transferUnit(actor, { unitId: id, ...body });
  }

  @Post('fleet/units/import')
  @Permissions('fleet.manage')
  importUnits(
    @Body(new ZodValidationPipe(zUnitImport)) body: z.infer<typeof zUnitImport>,
    @CurrentActor() actor: Actor,
  ) {
    return this.fleet.importUnits(actor, { csv: body.csv, commit: body.commit ?? false });
  }

  // NB: these two must be registered after the literal 'fleet/units/import' route above — Nest
  // matches routes in declaration order and 'fleet/units/:id' would otherwise swallow it.
  @Post('fleet/units')
  @Permissions('fleet.manage')
  createUnit(
    @Body(new ZodValidationPipe(zCreateUnit)) body: z.infer<typeof zCreateUnit>,
    @CurrentActor() actor: Actor,
  ) {
    return this.fleet.createUnit(actor, body);
  }

  @Post('fleet/units/:id')
  @Permissions('fleet.manage')
  updateUnit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zUpdateUnit)) body: z.infer<typeof zUpdateUnit>,
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ) {
    const ifMatch = req.header('If-Match');
    return this.fleet.updateUnit(actor, id, body, ifMatch ? Number(ifMatch) : undefined);
  }

  @Post('fleet/units/:id/retire')
  @Permissions('fleet.manage')
  retireUnit(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.fleet.setUnitRetired(actor, id, true);
  }

  @Post('fleet/units/:id/restore')
  @Permissions('fleet.manage')
  restoreUnit(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.fleet.setUnitRetired(actor, id, false);
  }

  // --- rate plans (SCREEN-OPS-025/026) ---

  @Get('pricing/rate-plans')
  @Permissions('config.read', 'config.publish')
  listPlans() {
    return this.pricing.listPlans();
  }

  @Post('pricing/rate-plans')
  @Permissions('config.publish')
  upsertPlan(
    @Req() req: Request,
    @Body(new ZodValidationPipe(zRatePlan)) body: z.infer<typeof zRatePlan>,
    @CurrentActor() actor: Actor,
  ) {
    const ifMatch = req.header('If-Match');
    return this.pricing.upsertPlan(actor, body, ifMatch ? Number(ifMatch) : undefined);
  }

  @Post('pricing/rate-plans/:id/publish')
  @Permissions('config.publish')
  publishPlan(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.pricing.publishPlan(actor, id);
  }

  @Delete('pricing/rate-plans/:id')
  @Permissions('config.publish')
  deletePlan(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.pricing.deletePlan(actor, id);
  }

  // --- holds admin (SCREEN-OPS-028) ---

  @Get('availability/holds')
  @Permissions('reservation.read', 'config.read')
  listHolds(@Query('status') status?: string) {
    return this.availability.listHolds(status ?? 'active');
  }

  @Post('availability/holds/:id/release')
  @Permissions('reservation.cancel', 'config.publish')
  releaseHold(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.availability.releaseHold(actor, id, 'forced');
  }
}
