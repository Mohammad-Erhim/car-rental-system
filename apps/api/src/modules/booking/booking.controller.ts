import { createHash } from 'node:crypto';

import { zClaimGuestRequest, zConfirmBookingRequest } from '@carrental/contracts';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { AppError } from '../../common/app-error';
import { CurrentActor, MaybeCurrentActor, OptionalAuth } from '../../common/auth/auth.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { BookingService } from './booking.service';

@ApiTags('booking')
@Controller({ version: '1' })
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Post('bookings/confirm')
  @OptionalAuth()
  @ApiOperation({
    operationId: 'booking_confirm',
    summary: 'Confirm a held quote into a reservation',
  })
  async confirm(
    @Body(new ZodValidationPipe(zConfirmBookingRequest))
    body: z.infer<typeof zConfirmBookingRequest>,
    @Req() req: Request,
    @MaybeCurrentActor() actor?: Actor,
  ) {
    return this.booking.confirm({
      quoteReference: body.quoteReference,
      actor: actor ?? null,
      holderKey: body.holderKey,
      drivers: body.drivers,
      extras: body.extras,
      acceptTerms: body.acceptTerms,
      paymentToken: body.paymentToken,
      simulateWriteFailure: body.simulateWriteFailure,
      ipHash: req.ip ? createHash('sha256').update(req.ip).digest('hex') : undefined,
    });
  }

  @Get('bookings/mine')
  @ApiOperation({ operationId: 'booking_listMine', summary: 'The signed-in customer reservations' })
  listMine(@CurrentActor() actor: Actor) {
    return this.booking.listForActor(actor);
  }

  @Get('bookings/:reference')
  @OptionalAuth()
  async get(
    @Param('reference') reference: string,
    @Query('token') token: string | undefined,
    @MaybeCurrentActor() actor?: Actor,
  ) {
    if (!actor) {
      if (!token || !(await this.booking.verifyGuestToken(reference, token))) {
        throw new AppError('auth_required', { title: 'Sign in or use your booking link' });
      }
    }
    return this.booking.getReservation(reference, actor ?? null);
  }

  @Post('bookings/:reference/claim')
  @ApiOperation({
    operationId: 'booking_claimGuest',
    summary: 'Attach a guest booking to my account',
  })
  claim(
    @Param('reference') reference: string,
    @Body(new ZodValidationPipe(zClaimGuestRequest)) body: z.infer<typeof zClaimGuestRequest>,
    @CurrentActor() actor: Actor,
  ) {
    return this.booking.claimGuest(actor, reference, body.token);
  }
}
