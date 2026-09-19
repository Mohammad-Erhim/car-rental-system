import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AppError } from '../../common/app-error';
import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { InvoicePublic } from '../invoice/invoice.public';

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
const zManualRefund = z.object({
  amountMinor: z.number().int().positive(),
  note: z.string().min(1).max(1000),
});

// No single path fits: this controller serves both customer-facing 'reservations/*' routes and
// staff 'ops/*' routes, each declared in full on its own method — `path: ''` makes that explicit
// rather than an implicit default (CLAUDE.md: every controller sets an explicit path).
@ApiTags('reservations')
@Controller({ path: '', version: '1' })
export class ReservationController {
  constructor(
    private readonly ops: ReservationOpsService,
    private readonly invoices: InvoicePublic,
  ) {}

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

  @Get('reservations/:reference/invoices')
  async listInvoices(@Param('reference') reference: string, @CurrentActor() actor: Actor) {
    await this.ops.detail(reference, actor); // ownership check — throws not-found/forbidden
    return this.invoices.listForReservation(reference);
  }

  @Get('reservations/:reference/invoices/:number')
  async invoice(
    @Param('reference') reference: string,
    @Param('number') number: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.ops.detail(reference, actor); // ownership check — throws not-found/forbidden
    const inv = await this.invoices.getByNumber(number);
    if (inv.reservationReference !== reference) throw AppError.notFound('invoice');
    return inv;
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
    @CurrentActor() actor: Actor,
    @Query('view') view?: string,
    @Query('state') state?: string,
    @Query('locationCode') locationCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ops.list(actor, {
      view: view === 'all' ? 'all' : 'queue',
      state,
      locationCode,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
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

  @Post('ops/reservations/:reference/refund')
  @Permissions('payment.refund')
  refund(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zManualRefund)) body: z.infer<typeof zManualRefund>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.manualRefund(reference, actor, body);
  }

  @Get('ops/reservations/:reference/invoices')
  @Permissions('payment.read', 'payment.reconcile', 'reservation.read')
  opsInvoices(@Param('reference') reference: string) {
    return this.invoices.listForReservation(reference);
  }

  @Get('ops/payments/reconciliation')
  @OrgWide()
  @Permissions('payment.reconcile', 'payment.read')
  listExceptions() {
    return this.ops.listExceptions();
  }

  @Post('ops/payments/reconciliation/run')
  @OrgWide()
  @Permissions('payment.reconcile')
  reconcile(
    @Body(new ZodValidationPipe(z.object({ injectMismatchRef: z.string().optional() })))
    body: { injectMismatchRef?: string },
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.reconcile(actor, body);
  }

  @Post('ops/payments/reconciliation/:id/resolve')
  @OrgWide()
  @Permissions('payment.reconcile')
  resolveException(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zResolve)) body: z.infer<typeof zResolve>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.resolveException(actor, id, body.note);
  }

  @Get('ops/cases')
  @OrgWide()
  @Permissions('payment.reconcile', 'payment.read')
  cases() {
    return this.ops.openCasesList();
  }

  @Post('ops/cases/:id/resolve')
  @OrgWide()
  @Permissions('payment.reconcile')
  resolveCase(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zResolve)) body: z.infer<typeof zResolve>,
    @CurrentActor() actor: Actor,
  ) {
    return this.ops.resolveCase(actor, id, body.note);
  }

  @Post('ops/cases/:id/retry')
  @OrgWide()
  @Permissions('payment.reconcile')
  retryCase(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.ops.retryCase(actor, id);
  }
}
