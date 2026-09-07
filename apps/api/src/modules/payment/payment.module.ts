import { Module } from '@nestjs/common';

import { PaymentPort, SimulatorPaymentAdapter } from './payment.port';
import { PaymentService } from './payment.service';

/**
 * STAGE-003 — payments. The only adapter is the deterministic simulator (card data never enters
 * the system); a real provider adapter would bind `PaymentPort` here in production config.
 */
@Module({
  providers: [PaymentService, { provide: PaymentPort, useClass: SimulatorPaymentAdapter }],
  exports: [PaymentService],
})
export class PaymentModule {}
