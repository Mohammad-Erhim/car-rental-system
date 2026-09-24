import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { PaymentModule } from '../payment/payment.module';

import { AccountRepo } from './account.repo';
import { IamController } from './iam.controller';
import { IamPublic } from './iam.public';
import { IamService } from './iam.service';
import { PrivacyOpsController } from './privacy.ops.controller';
import { PrivacyService } from './privacy.service';
import { ProfileService } from './profile.service';
import { VerificationService } from './verification.service';

@Module({
  imports: [ConfigModule, PaymentModule],
  controllers: [IamController, PrivacyOpsController],
  providers: [
    AccountRepo,
    IamService,
    ProfileService,
    PrivacyService,
    VerificationService,
    IamPublic,
  ],
  exports: [IamPublic, VerificationService],
})
export class IamModule {}
