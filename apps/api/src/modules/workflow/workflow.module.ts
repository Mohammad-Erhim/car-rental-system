import { Global, Module } from '@nestjs/common';

import { WorkflowActorsService } from './workflow-actors.service';
import { WorkflowAdminController } from './workflow-admin.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowNotifier } from './workflow-notifier.service';
import { WorkflowQueryService } from './workflow-query.service';
import { WorkflowRegistry } from './workflow-registry.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowPublic } from './workflow.public';

/**
 * Configurable approval pipelines. Global so the domain modules that own a governed action
 * (config versions, templates, customer restrictions, …) can register it and call `gate()` through
 * `WorkflowPublic` without a module-import cycle — workflows in turn only needs the notify port.
 */
@Global()
@Module({
  controllers: [WorkflowController, WorkflowAdminController],
  providers: [
    WorkflowRegistry,
    WorkflowActorsService,
    WorkflowDefinitionService,
    WorkflowEngineService,
    WorkflowQueryService,
    WorkflowNotifier,
    WorkflowPublic,
  ],
  exports: [WorkflowPublic, WorkflowEngineService, WorkflowDefinitionService, WorkflowRegistry],
})
export class WorkflowModule {}
