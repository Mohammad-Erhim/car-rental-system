import { Module } from '@nestjs/common';

import { ConfigModule as DomainConfigModule } from '../config/config.module';
import { CustomerModule } from '../customer/customer.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PaymentModule } from '../payment/payment.module';

import { RentalController } from './rental.controller';
import { RentalService } from './rental.service';

/**
 * STAGE-005 — rental lifecycle. Assign a unit to a confirmed reservation, run pickup (agreement
 * snapshot), extend (re-price + delta via PricingService/PaymentService), and return (inspection
 * + fuel/damage settlement, unit → prep until readiness). The "one open rental per unit"
 * invariant is a partial unique index on `rental.unit_id`.
 */
@Module({
  imports: [DiscoveryModule, PaymentModule, DomainConfigModule, CustomerModule],
  controllers: [RentalController],
  providers: [RentalService],
  exports: [RentalService],
})
export class RentalModule {}
