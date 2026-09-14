import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';

import { EmailConfigController } from './email-config.controller';
import { EmailConfigService } from './email-config.service';
import { NotificationRuleService } from './notification-rule.service';
import { DevMailController, TemplateController } from './notify.controller';
import { NotifyService } from './notify.service';
import { TemplateService } from './template.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [DevMailController, TemplateController, EmailConfigController],
  providers: [NotifyService, TemplateService, NotificationRuleService, EmailConfigService],
  exports: [NotifyService, NotificationRuleService, EmailConfigService],
})
export class NotifyModule {}
