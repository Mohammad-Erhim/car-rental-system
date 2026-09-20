import { zWorkflowDecision } from '@carrental/contracts';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { RequireAudience } from '../../common/auth/decorators';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowQueryService } from './workflow-query.service';

const zPage = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
const zInstances = zPage.extend({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.string().max(30).optional(),
  actionKey: z.string().max(80).optional(),
});
const zReason = z.object({ reason: z.string().max(1000).optional() });
const zRequiredReason = z.object({ reason: z.string().min(3).max(1000) });
const zForce = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().min(3).max(1000),
});
const zReassign = z.object({
  toStaffProfileId: z.string().uuid(),
  fromStaffProfileId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
});

/**
 * Everything a staff member does with workflows day to day: their task inbox, deciding a task, the
 * requests they made. Access is by assignment, not by permission — you see and decide what was
 * asked of you. Monitoring actions need `workflow.monitor`.
 */
@ApiTags('workflows')
@RequireAudience('staff')
@Controller({ path: 'workflows', version: '1' })
export class WorkflowController {
  constructor(
    private readonly engine: WorkflowEngineService,
    private readonly query: WorkflowQueryService,
  ) {}

  @Get('inbox')
  @ApiOperation({ operationId: 'workflows_inbox', summary: 'My open tasks (overdue first)' })
  inbox(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(zPage)) q: z.infer<typeof zPage>,
  ) {
    return this.query.inbox(actor, q);
  }

  @Get('inbox/count')
  @ApiOperation({
    operationId: 'workflows_inboxCount',
    summary: 'How many tasks are waiting for me',
  })
  count(@CurrentActor() actor: Actor) {
    return this.query.pendingCount(actor);
  }

  @Post('tasks/:id/decide')
  @ApiOperation({
    operationId: 'workflows_decide',
    summary: 'Approve, reject, send back, or complete a task',
  })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zWorkflowDecision)) body: z.infer<typeof zWorkflowDecision>,
    @CurrentActor() actor: Actor,
  ) {
    return this.engine.decide(actor, id, body);
  }

  @Get('instances')
  @ApiOperation({
    operationId: 'workflows_listInstances',
    summary: 'Requests I made — or all of them, for a monitor',
  })
  instances(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(zInstances)) q: z.infer<typeof zInstances>,
  ) {
    return this.query.instances(actor, q);
  }

  @Get('instances/:id')
  @ApiOperation({
    operationId: 'workflows_getInstance',
    summary: 'One request: steps, decisions, proposed change, history',
  })
  instance(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.query.instanceDetail(actor, id);
  }

  @Post('instances/:id/withdraw')
  @ApiOperation({ operationId: 'workflows_withdraw', summary: 'Withdraw my request' })
  withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zReason)) body: z.infer<typeof zReason>,
    @CurrentActor() actor: Actor,
  ) {
    return this.engine.withdraw(actor, id, body.reason);
  }

  @Post('instances/:id/cancel')
  @Permissions('workflow.monitor')
  @ApiOperation({ operationId: 'workflows_cancel', summary: 'Cancel any open request (audited)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zRequiredReason)) body: z.infer<typeof zRequiredReason>,
    @CurrentActor() actor: Actor,
  ) {
    return this.engine.cancel(actor, id, body.reason);
  }

  @Post('instances/:id/force')
  @Permissions('workflow.monitor')
  @ApiOperation({
    operationId: 'workflows_force',
    summary: 'Push the current step through, or reject the request (audited)',
  })
  force(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zForce)) body: z.infer<typeof zForce>,
    @CurrentActor() actor: Actor,
  ) {
    return this.engine.force(actor, id, body.decision, body.reason);
  }

  @Post('tasks/:id/reassign')
  @Permissions('workflow.monitor')
  @ApiOperation({ operationId: 'workflows_reassign', summary: 'Ask someone else to take a task' })
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zReassign)) body: z.infer<typeof zReassign>,
    @CurrentActor() actor: Actor,
  ) {
    return this.engine.reassign(actor, id, body);
  }
}
