import { Module } from '@nestjs/common';

import { IamModule } from '../iam/iam.module';

import { AdminController } from './admin.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [IamModule],
  controllers: [AdminController],
  providers: [StaffService],
  exports: [StaffService],
})
export class AdminModule {}
