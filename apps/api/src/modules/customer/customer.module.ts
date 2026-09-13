import { Module } from '@nestjs/common';

import { ConfigModule as DomainConfigModule } from '../config/config.module';

import { CustomerMergeService } from './customer-merge.service';
import { CustomerRestrictionService } from './customer-restriction.service';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  controllers: [CustomerController],
  imports: [DomainConfigModule],
  providers: [CustomerService, CustomerRestrictionService, CustomerMergeService],
  exports: [CustomerRestrictionService],
})
export class CustomerModule {}
