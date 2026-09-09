import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { Permissions } from '../../common/auth/permissions.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { ConsentService } from './consent.service';

const zLogQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.enum(['accept_all', 'reject_all', 'save_preferences', 'withdraw']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Ops-only view over the consent audit trail (proof of consent, opt-in rates). */
@ApiTags('admin')
@Controller({ path: 'ops/consent', version: '1' })
export class ConsentAdminController {
  constructor(private readonly consent: ConsentService) {}

  @Get('log')
  @Permissions('audit.read')
  @ApiOperation({
    operationId: 'consent_log',
    summary: 'Consent events from the audit trail, with opt-in summary',
  })
  log(@Query(new ZodValidationPipe(zLogQuery)) q: z.infer<typeof zLogQuery>) {
    return this.consent.log(q);
  }
}
