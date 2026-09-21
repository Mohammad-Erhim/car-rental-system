import { Module } from '@nestjs/common';

import { ConfigModule as DomainConfigModule } from '../config/config.module';

import { CustomerDataRequestService } from './customer-data-request.service';
import { CustomerMergeService } from './customer-merge.service';
import { CustomerRestrictionService } from './customer-restriction.service';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  controllers: [CustomerController],
  imports: [DomainConfigModule],
  providers: [
    CustomerService,
    CustomerRestrictionService,
    CustomerMergeService,
    CustomerDataRequestService,
  ],
  exports: [CustomerRestrictionService],
})
export class CustomerModule {}
