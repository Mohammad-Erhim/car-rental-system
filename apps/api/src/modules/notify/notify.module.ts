import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { WorkflowMessenger } from '../workflow/workflow.public';

import { EmailConfigController } from './email-config.controller';
import { EmailConfigService } from './email-config.service';
import { NotificationRuleService } from './notification-rule.service';
import { DevMailController, TemplateController } from './notify.controller';
import { NotifyPublic } from './notify.public';
import { NotifyService } from './notify.service';
import { TemplateService } from './template.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [DevMailController, TemplateController, EmailConfigController],
  providers: [
    NotifyService,
    NotifyPublic,
    { provide: WorkflowMessenger, useExisting: NotifyPublic },
    TemplateService,
    NotificationRuleService,
    EmailConfigService,
  ],
  exports: [
    NotifyService,
    NotifyPublic,
    WorkflowMessenger,
    NotificationRuleService,
    EmailConfigService,
  ],
})
export class NotifyModule {}
