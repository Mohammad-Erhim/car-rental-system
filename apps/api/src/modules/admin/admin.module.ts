import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { IamModule } from '../iam/iam.module';

import { AdminController } from './admin.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [IamModule, ConfigModule],
  controllers: [AdminController],
  providers: [StaffService],
  exports: [StaffService],
})
export class AdminModule {}
