import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { AccessAdminService } from './access-admin.service';
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

const zConditions = z
  .record(z.object({ amountMinorMax: z.number().int().min(0).optional() }))
  .default({});
const zCreateRole = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissionActions: z.array(z.string().max(80)).max(200),
  conditions: zConditions.optional(),
});
const zUpdateRole = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionActions: z.array(z.string().max(80)).max(200).optional(),
  conditions: zConditions.optional(),
  expectedVersion: z.number().int().optional(),
});
const zCloneRole = z.object({ code: z.string().min(2).max(40), name: z.string().min(1).max(120) });
const zMatrix = z.object({
  dryRun: z.boolean().optional(),
  changes: z
    .array(
      z.object({
        roleCode: z.string().max(40),
        add: z.array(z.string().max(80)).max(200).optional(),
        remove: z.array(z.string().max(80)).max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
});
const zAssignment = z.object({
  roleCode: z.string().max(40),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  reason: z.string().max(500).optional(),
});
const zOverride = z.object({
  action: z.string().max(80),
  effect: z.enum(['allow', 'deny']),
  validUntil: z.string().datetime().nullable().optional(),
  reason: z.string().min(3).max(500),
});
const zGroup = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  accountIds: z.array(z.string().uuid()).max(500).optional(),
});

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly staff: StaffService,
    private readonly access: AccessAdminService,
  ) {}

  @Get('roles')
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_listRoles', summary: 'Roles + permission action catalogue' })
  listRoles(@CurrentActor() actor: Actor) {
    return this.access.listRoles(actor);
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
  @OrgWide()
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

  // ------------------------------------------------------------------ roles

  @Post('roles')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_createRole', summary: 'Create a custom role' })
  createRole(
    @Body(new ZodValidationPipe(zCreateRole)) body: z.infer<typeof zCreateRole>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.createRole(actor, body);
  }

  @Patch('roles/:code')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_updateRole', summary: 'Edit a custom role' })
  updateRole(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(zUpdateRole)) body: z.infer<typeof zUpdateRole>,
    @CurrentActor() actor: Actor,
  ) {
    const { expectedVersion, ...patch } = body;
    return this.access.updateRole(actor, code, patch, expectedVersion);
  }

  @Post('roles/:code/clone')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_cloneRole', summary: 'Copy a role (system roles included)' })
  cloneRole(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(zCloneRole)) body: z.infer<typeof zCloneRole>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.cloneRole(actor, code, body);
  }

  @Post('roles/:code/archive')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_archiveRole', summary: 'Archive a custom role' })
  archiveRole(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.access.setRoleArchived(actor, code, true);
  }

  @Post('roles/:code/restore')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_restoreRole', summary: 'Restore an archived role' })
  restoreRole(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.access.setRoleArchived(actor, code, false);
  }

  // ------------------------------------------------------------ matrix / lookup

  @Put('permissions/matrix')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'admin_applyPermissionMatrix',
    summary: 'Bulk-change roles × permissions (dryRun previews the effect)',
  })
  applyMatrix(
    @Body(new ZodValidationPipe(zMatrix)) body: z.infer<typeof zMatrix>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.applyMatrix(actor, body);
  }

  @Get('access/users-matrix')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_usersMatrix', summary: 'Staff × permissions (effective)' })
  usersMatrix(@CurrentActor() actor: Actor) {
    return this.access.usersMatrix(actor);
  }

  @Get('access/who-can')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_whoCan', summary: 'Who can do this action?' })
  whoCan(@Query('action') action: string, @CurrentActor() actor: Actor) {
    return this.access.whoCan(actor, action);
  }

  @Get('access/history')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_accessHistory', summary: 'Access-change history' })
  history(
    @CurrentActor() actor: Actor,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.access.history(actor, { accountId, limit: limit ? Number(limit) : undefined });
  }

  // ------------------------------------------------------------ people access

  @Get('staff/:accountId/access')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({
    operationId: 'admin_staffAccess',
    summary: 'A person’s roles, overrides and effective permissions',
  })
  staffAccess(@Param('accountId') accountId: string, @CurrentActor() actor: Actor) {
    return this.access.staffAccess(actor, accountId);
  }

  @Get('staff/:accountId/explain')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({
    operationId: 'admin_explainAccess',
    summary: 'Why can / can’t this person do X?',
  })
  explain(
    @Param('accountId') accountId: string,
    @Query('action') action: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.explain(actor, accountId, action);
  }

  @Post('staff/:accountId/assignments')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'admin_addAssignment',
    summary: 'Give a person a role (optionally time-bound)',
  })
  addAssignment(
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(zAssignment)) body: z.infer<typeof zAssignment>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.addAssignment(actor, accountId, body);
  }

  @Delete('staff/:accountId/assignments/:id')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_removeAssignment', summary: 'Remove a role assignment' })
  removeAssignment(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.removeAssignment(actor, accountId, id);
  }

  @Post('staff/:accountId/overrides')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'admin_setOverride',
    summary: 'Allow or deny one permission for a person',
  })
  addOverride(
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(zOverride)) body: z.infer<typeof zOverride>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.addOverride(actor, accountId, body);
  }

  @Delete('staff/:accountId/overrides/:id')
  @OrgWide()
  @Permissions('staff.manage')
  @StepUp()
  @ApiOperation({ operationId: 'admin_removeOverride', summary: 'Remove a permission override' })
  removeOverride(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.removeOverride(actor, accountId, id);
  }

  // ------------------------------------------------------------------ groups

  @Get('groups')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_listGroups', summary: 'Staff teams' })
  listGroups(@CurrentActor() actor: Actor) {
    return this.access.listGroups(actor);
  }

  @Post('groups')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_createGroup', summary: 'Create a team' })
  createGroup(
    @Body(new ZodValidationPipe(zGroup)) body: z.infer<typeof zGroup>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.saveGroup(actor, body);
  }

  @Put('groups/:code')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_updateGroup', summary: 'Edit a team and its members' })
  updateGroup(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(zGroup)) body: z.infer<typeof zGroup>,
    @CurrentActor() actor: Actor,
  ) {
    return this.access.saveGroup(actor, { ...body, code }, code);
  }

  @Post('groups/:code/archive')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_archiveGroup', summary: 'Archive a team' })
  archiveGroup(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.access.setGroupArchived(actor, code, true);
  }

  @Post('groups/:code/restore')
  @OrgWide()
  @Permissions('staff.manage')
  @ApiOperation({ operationId: 'admin_restoreGroup', summary: 'Restore a team' })
  restoreGroup(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.access.setGroupArchived(actor, code, false);
  }
}
