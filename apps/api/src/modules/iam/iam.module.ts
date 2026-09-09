import { Module } from '@nestjs/common';

import { AccountRepo } from './account.repo';
import { IamController } from './iam.controller';
import { IamPublic } from './iam.public';
import { IamService } from './iam.service';
import { ProfileService } from './profile.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [IamController],
  providers: [AccountRepo, IamService, ProfileService, VerificationService, IamPublic],
  exports: [IamPublic, VerificationService],
})
export class IamModule {}
