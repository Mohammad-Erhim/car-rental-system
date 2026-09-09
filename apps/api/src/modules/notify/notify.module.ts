import { Global, Module } from '@nestjs/common';

import { NotificationRuleService } from './notification-rule.service';
import { DevMailController, TemplateController } from './notify.controller';
import { NotifyService } from './notify.service';
import { TemplateService } from './template.service';

@Global()
@Module({
  controllers: [DevMailController, TemplateController],
  providers: [NotifyService, TemplateService, NotificationRuleService],
  exports: [NotifyService, NotificationRuleService],
})
export class NotifyModule {}
