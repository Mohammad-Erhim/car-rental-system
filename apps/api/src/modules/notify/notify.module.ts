import { Controller, Get, Global, Module, Query, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../../common/auth/decorators';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

import { NotifyService } from './notify.service';

/** Dev-only mail/message viewer (DEC-016). Disabled outside development. */
@ApiExcludeController()
@Controller('dev/mail')
class DevMailController {
  constructor(
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @Public()
  async list(@Query('limit') limit?: string) {
    if (this.env.NODE_ENV === 'production') return { disabled: true };
    return { messages: await this.notify.recent(limit ? Number(limit) : 50) };
  }
}

@Global()
@Module({
  controllers: [DevMailController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
