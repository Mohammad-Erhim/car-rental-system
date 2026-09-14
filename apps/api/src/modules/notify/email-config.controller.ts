import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { EmailConfigService } from './email-config.service';

const zUpdate = z.object({
  activeDriver: z.enum(['outbox', 'smtp']).optional(),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      secure: z.boolean().optional(),
      username: z.string().optional(),
      password: z.string().min(1).optional(),
      fromAddress: z.string().email().optional(),
      fromName: z.string().optional(),
    })
    .optional(),
});

/**
 * The email provider settings screen. Every write is `email.manage`-gated (administrator only —
 * deliberately excluded from the generic 'ALL' role grant every other admin permission gets,
 * same tier as `payment.manage`) and step-up-confirmed. `GET` is gated the same way, same
 * reasoning as payments: even seeing whether a real SMTP account is configured is narrow.
 */
@ApiTags('ops-email')
@Controller({ path: 'ops/email', version: '1' })
export class EmailConfigController {
  constructor(private readonly config: EmailConfigService) {}

  @Get('config')
  @Permissions('email.manage')
  getConfig() {
    return this.config.getSummary();
  }

  @Put('config')
  @Permissions('email.manage')
  @StepUp()
  async updateConfig(
    @Body(new ZodValidationPipe(zUpdate)) body: z.infer<typeof zUpdate>,
    @CurrentActor() actor: Actor,
  ) {
    return this.config.update(actor, body);
  }
}
