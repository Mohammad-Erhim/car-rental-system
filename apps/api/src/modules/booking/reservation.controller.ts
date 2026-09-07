import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { ReservationOpsService } from './reservation-ops.service';

const zCancel = z.object({
  reasonCode: z.string().max(60).optional(),
  note: z.string().max(1000).optional(),
});
const zModify = z.object({
  pickupAt: z.string().datetime({ offset: true }).optional(),
  returnAt: z.string().datetime({ offset: true }).optional(),
  categoryCode: z.string().max(40).optional(),
  paymentToken: z.string().max(200).optional(),
  reasonCode: z.string().max(60).optional(),
});
const zResolve = z.object({ note: z.string().min(1).max(1000) });

@ApiTags('reservations')
@Controller({ version: '1' })
export class ReservationController {
  constructor(private readonly ops: ReservationOpsService) {}

  // ---- customer ----

  @Get('reservations/mine')
  mine(@CurrentActor() actor: Actor) {
    return this.ops.mineForActor(actor);
  }

  @Get('reservations/:reference')
  detail(@Param('reference') reference: string, @CurrentActor() actor: Actor) {
    return this.ops.detail(reference, actor);
  }

  @Get('reservations/:reference/history')
  history(@Param('reference') reference: string, @CurrentActor() actor: Actor) {
    return this.ops.history(reference, actor);
  }

  @Post('reservations/:reference/cancel')
  cancel(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zCancel)) body: z.infer<typeof zCancel>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.cancel(reference, actor, body);
  }

  @Post('reservations/:reference/modify')
  modify(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zModify)) body: z.infer<typeof zModify>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.modify(reference, actor, body);
  }

  // ---- ops ----

  @Get('ops/reservations')
  @Permissions('reservation.read', 'reservation.modify')
  list(
    @Query('state') state?: string,
    @Query('locationCode') locationCode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ops.list({ state, locationCode, limit: limit ? Number(limit) : undefined });
  }

  @Post('ops/reservations/:reference/no-show')
  @Permissions('reservation.modify', 'reservation.cancel')
  noShow(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(z.object({ note: z.string().max(1000).optional() })))
    body: { note?: string },
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.markNoShow(reference, actor, body.note);
  }

  @Get('ops/payments/reconciliation')
  @Permissions('payment.reconcile', 'payment.read')
  listExceptions() {
    return this.ops.listExceptions();
  }

  @Post('ops/payments/reconciliation/run')
  @Permissions('payment.reconcile')
  reconcile(
    @Body(new ZodValidationPipe(z.object({ injectMismatchRef: z.string().optional() })))
    body: { injectMismatchRef?: string },
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.reconcile(actor, body);
  }

  @Post('ops/payments/reconciliation/:id/resolve')
  @Permissions('payment.reconcile')
  resolveException(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zResolve)) body: z.infer<typeof zResolve>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.resolveException(actor, id, body.note);
  }

  @Get('ops/cases')
  @Permissions('payment.reconcile', 'payment.read')
  cases() {
    return this.ops.openCasesList();
  }

  @Post('ops/cases/:id/resolve')
  @Permissions('payment.reconcile')
  resolveCase(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zResolve)) body: z.infer<typeof zResolve>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.resolveCase(actor, id, body.note);
  }
}
