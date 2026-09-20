import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { WorkflowDefinitionService } from './workflow-definition.service';

const zCode = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'lowercase letters, digits and _');
const zCreate = z.object({
  code: zCode,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  spec: z.unknown().refine((v) => v !== undefined, 'required'),
  note: z.string().max(500).optional(),
});
const zDraft = z.object({
  spec: z.unknown().refine((v) => v !== undefined, 'required'),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});
const zValidate = z.object({
  spec: z.unknown().refine((v) => v !== undefined, 'required'),
  actionKeys: z.array(z.string().max(80)).max(50).optional(),
});
const zClone = z.object({ code: zCode, name: z.string().min(1).max(120) });
const zPublish = z.object({ versionId: z.string().uuid().optional() });
const zSimulate = z.object({
  spec: z.unknown().optional(),
  definitionId: z.string().uuid().optional(),
  actionKey: z.string().max(80).optional(),
  context: z.record(z.unknown()).optional(),
});
const zBinding = z.object({
  id: z.string().uuid().optional(),
  actionKey: z.string().max(80),
  definitionId: z.string().uuid(),
  condition: z.record(z.unknown()).nullable().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  label: z.string().max(120).optional(),
  active: z.boolean().optional(),
});

/** Administration → Workflows: definitions, their versions, and which action each governs. */
@ApiTags('workflows-admin')
@OrgWide()
@Controller({ path: 'admin/workflows', version: '1' })
export class WorkflowAdminController {
  constructor(private readonly defs: WorkflowDefinitionService) {}

  @Get('actions')
  @Permissions('workflow.manage', 'workflow.monitor')
  @ApiOperation({
    operationId: 'workflowsAdmin_actions',
    summary: 'Actions a workflow can govern, with their variables',
  })
  actions() {
    return this.defs.actions();
  }

  @Get('options')
  @Permissions('workflow.manage')
  @ApiOperation({
    operationId: 'workflowsAdmin_options',
    summary: 'Roles, teams and people a step can address',
  })
  options(@CurrentActor() actor: Actor) {
    return this.defs.options(actor.organizationId!);
  }

  @Get('definitions')
  @Permissions('workflow.manage', 'workflow.monitor')
  @ApiOperation({ operationId: 'workflowsAdmin_list', summary: 'Workflow definitions' })
  list(@CurrentActor() actor: Actor) {
    return this.defs.list(actor.organizationId!);
  }

  @Post('definitions/validate')
  @Permissions('workflow.manage')
  @ApiOperation({
    operationId: 'workflowsAdmin_validate',
    summary: 'Check a definition without saving it',
  })
  async validate(
    @Body(new ZodValidationPipe(zValidate)) body: z.infer<typeof zValidate>,
    @CurrentActor() actor: Actor,
  ) {
    return {
      issues: await this.defs.validate(actor.organizationId!, body.spec, body.actionKeys ?? []),
    };
  }

  @Post('simulate')
  @Permissions('workflow.manage')
  @ApiOperation({
    operationId: 'workflowsAdmin_simulate',
    summary: 'Who would be asked, for a sample request',
  })
  simulate(
    @Body(new ZodValidationPipe(zSimulate)) body: z.infer<typeof zSimulate>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.simulate(actor, body);
  }

  @Get('definitions/:id')
  @Permissions('workflow.manage', 'workflow.monitor')
  @ApiOperation({
    operationId: 'workflowsAdmin_get',
    summary: 'A definition with all its versions',
  })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.defs.get(actor.organizationId!, id);
  }

  @Post('definitions')
  @Permissions('workflow.manage')
  @StepUp()
  @ApiOperation({ operationId: 'workflowsAdmin_create', summary: 'Create a workflow (as a draft)' })
  create(
    @Body(new ZodValidationPipe(zCreate)) body: z.infer<typeof zCreate>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.create(actor, body);
  }

  @Put('definitions/:id/draft')
  @Permissions('workflow.manage')
  @ApiOperation({ operationId: 'workflowsAdmin_saveDraft', summary: 'Save the working draft' })
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zDraft)) body: z.infer<typeof zDraft>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.saveDraft(actor, id, body);
  }

  @Post('definitions/:id/publish')
  @Permissions('workflow.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'workflowsAdmin_publish',
    summary: 'Publish the draft (blocked while it has problems)',
  })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zPublish)) body: z.infer<typeof zPublish>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.publish(actor, id, body);
  }

  @Post('definitions/:id/clone')
  @Permissions('workflow.manage')
  @ApiOperation({ operationId: 'workflowsAdmin_clone', summary: 'Copy a workflow as a new draft' })
  clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zClone)) body: z.infer<typeof zClone>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.clone(actor, id, body);
  }

  @Post('definitions/:id/archive')
  @Permissions('workflow.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'workflowsAdmin_archive',
    summary: 'Archive a workflow that is not bound',
  })
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.defs.archive(actor, id);
    return { ok: true };
  }

  @Get('bindings')
  @Permissions('workflow.manage', 'workflow.monitor')
  @ApiOperation({
    operationId: 'workflowsAdmin_bindings',
    summary: 'Which workflow governs which action',
  })
  bindings(@CurrentActor() actor: Actor) {
    return this.defs.bindings(actor.organizationId!);
  }

  @Put('bindings')
  @Permissions('workflow.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'workflowsAdmin_saveBinding',
    summary: 'Bind (or rebind) a workflow to an action',
  })
  saveBinding(
    @Body(new ZodValidationPipe(zBinding)) body: z.infer<typeof zBinding>,
    @CurrentActor() actor: Actor,
  ) {
    return this.defs.saveBinding(actor, body);
  }

  @Delete('bindings/:id')
  @Permissions('workflow.manage')
  @StepUp()
  @ApiOperation({
    operationId: 'workflowsAdmin_removeBinding',
    summary: 'Unbind — the action goes back to direct',
  })
  async removeBinding(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.defs.removeBinding(actor, id);
    return { ok: true };
  }
}
