import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { IamModule } from '../iam/iam.module';

import { AccessAdminService } from './access-admin.service';
import { AdminController } from './admin.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [IamModule, ConfigModule],
  controllers: [AdminController],
  providers: [StaffService, AccessAdminService],
  exports: [StaffService, AccessAdminService],
})
export class AdminModule {}
