import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions, StaffPermissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { RentalService } from './rental.service';

const zAssign = z.object({ unitId: z.string().uuid().optional() });
const zPickup = z.object({
  odometerKm: z.number().int().min(0),
  fuelPct: z.number().int().min(0).max(100),
  driverName: z.string().min(1).max(200),
  // a driving-licence number is required at pickup (also enforced in the service)
  licenceNumber: z.string().min(1).max(80),
});
const zExtend = z.object({
  newReturnAt: z.string().datetime({ offset: true }),
  paymentToken: z.string().max(200).optional(),
});
const zIncident = z.object({
  category: z.enum(['breakdown', 'accident', 'damage', 'other']),
  note: z.string().max(1000).optional(),
  immobilised: z.boolean().optional(),
  replacementUnitId: z.string().uuid().optional(),
});
const zReturn = z.object({
  odometerKm: z.number().int().min(0),
  fuelPct: z.number().int().min(0).max(100),
  checklist: z.array(z.object({ item: z.string(), ok: z.boolean() })).optional(),
  findings: z
    .array(
      z.object({
        area: z.string().max(80),
        severity: z.enum(['minor', 'major']).optional(),
        description: z.string().max(500),
        chargeMinor: z.number().int().min(0).optional(),
      }),
    )
    .optional(),
});

/** Staff actions that may open a rental / extend one through the routes customers also use
 *  (`@StaffPermissions`, DEC-038) — the sets `GET /ops/rentals` and the dashboard's Extend button
 *  already require. */
const RENTAL_VIEW = ['rental.read', 'rental.pickup', 'rental.return'] as const;
const RENTAL_EXTEND = ['rental.pickup', 'rental.return'] as const;

// Serves both customer-facing 'rentals/*' routes and staff 'ops/*' routes, each declared in
// full on its own method — `path: ''` makes that explicit rather than an implicit default
// (CLAUDE.md: every controller sets an explicit path).
@ApiTags('rentals')
@Controller({ path: '', version: '1' })
export class RentalController {
  constructor(private readonly rentals: RentalService) {}

  // ---- customer (staff reach these too — `@StaffPermissions`, DEC-038) ----

  @Get('rentals/mine')
  mine(@CurrentActor() actor: Actor) {
    return this.rentals.mineForActor(actor);
  }

  @Get('rentals/:reference')
  @StaffPermissions(...RENTAL_VIEW)
  detail(@Param('reference') reference: string, @CurrentActor() actor: Actor) {
    return this.rentals.detailForActor(reference, actor);
  }

  @Post('rentals/:reference/extend')
  @StaffPermissions(...RENTAL_EXTEND)
  extend(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zExtend)) body: z.infer<typeof zExtend>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.extend(reference, actor, body);
  }

  // ---- ops (rental lifecycle) ----

  @Get('ops/rentals')
  @Permissions('rental.read', 'rental.pickup', 'rental.return')
  list(
    @CurrentActor() actor: Actor,
    @Query('state') state?: string,
    @Query('locationCode') locationCode?: string,
    @Query('flow') flow?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.rentals.list(actor, {
      state,
      locationCode,
      flow: flow === 'pickup' || flow === 'return' ? flow : undefined,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('ops/reservations/:reservationReference/assign')
  @Permissions('rental.pickup', 'fleet.manage')
  assign(
    @Param('reservationReference') reservationReference: string,
    @Body(new ZodValidationPipe(zAssign)) body: z.infer<typeof zAssign>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.assign(reservationReference, actor, body);
  }

  @Post('ops/rentals/:reference/pickup')
  @Permissions('rental.pickup')
  pickup(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zPickup)) body: z.infer<typeof zPickup>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.pickup(reference, actor, body);
  }

  @Post('ops/rentals/:reference/return')
  @Permissions('rental.return')
  returnRental(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zReturn)) body: z.infer<typeof zReturn>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.returnRental(reference, actor, body);
  }

  @Post('ops/rentals/:reference/incident')
  @Permissions('rental.pickup', 'rental.return')
  incident(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zIncident)) body: z.infer<typeof zIncident>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.raiseIncident(reference, actor, body);
  }

  @Post('ops/rentals/:reference/readiness')
  @Permissions('fleet.manage', 'rental.return')
  readiness(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(z.object({ passed: z.boolean() }))) body: { passed: boolean },
    @CurrentActor() actor: Actor,
  ) {
    return this.rentals.runReadiness(reference, actor, body.passed);
  }

  /**
   * FR-RNT-014 — flip every `active` rental that is past its scheduled return to `overdue`.
   * Runs automatically on the worker's housekeeping tick; this is the manual/ops trigger.
   */
  @Post('ops/rentals/overdue-sweep')
  @Permissions('rental.return')
  async overdueSweep() {
    const marked = await this.rentals.markOverdue();
    return { marked };
  }
}
