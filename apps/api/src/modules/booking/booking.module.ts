import { Module } from '@nestjs/common';

import { DiscoveryModule } from '../discovery/discovery.module';
import { NotifyModule } from '../notify/notify.module';
import { PaymentModule } from '../payment/payment.module';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { ReservationOpsService } from './reservation-ops.service';
import { ReservationController } from './reservation.controller';

/**
 * STAGE-003 — Booking & payment. `confirm()` consumes a STAGE-002 hold + quote (via the
 * discovery module's `PricingService`), takes exactly one intended charge (`PaymentService`,
 * idempotent on the reservation reference), persists the reservation atomically, consumes the
 * hold, and sends a confirmation. A failure after a successful capture opens a recovery case.
 */
@Module({
  imports: [DiscoveryModule, PaymentModule, NotifyModule],
  controllers: [BookingController, ReservationController],
  providers: [BookingService, ReservationOpsService],
  exports: [BookingService, ReservationOpsService],
})
export class BookingModule {}
