import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { StaffService } from './staff.service';

const zInvite = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  roleCodes: z.array(z.string()).min(1),
  locationScope: z.array(z.string()).optional(),
});
const zChangeAccess = z.object({
  roleCodes: z.array(z.string()).optional(),
  locationScope: z.array(z.string()).optional(),
  status: z.enum(['active', 'suspended', 'deactivated']).optional(),
});

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly staff: StaffService) {}

  @Get('roles')
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_listRoles', summary: 'Roles + permission action catalogue' })
  listRoles() {
    return this.staff.listRoles();
  }

  @Get('staff')
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_listStaff', summary: 'Staff accounts + access' })
  listStaff(@CurrentActor() actor: Actor) {
    return this.staff.listStaff(actor);
  }

  @Post('staff/invite')
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_inviteStaff', summary: 'Invite a staff member' })
  invite(
    @Body(new ZodValidationPipe(zInvite)) body: z.infer<typeof zInvite>,
    @CurrentActor() actor: Actor,
  ) {
    return this.staff.invite(actor, body);
  }

  @Post('staff/:accountId/access')
  @Permissions('staff.manage')
  @ApiOperation({
    operationId: 'admin_changeStaffAccess',
    summary: 'Change roles / scope / status',
  })
  changeAccess(
    @Req() req: Request,
    @Body(new ZodValidationPipe(zChangeAccess)) body: z.infer<typeof zChangeAccess>,
    @CurrentActor() actor: Actor,
  ) {
    return this.staff.changeAccess(actor, req.params.accountId!, body);
  }
}
