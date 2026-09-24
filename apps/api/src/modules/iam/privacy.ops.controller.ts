import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { PrivacyService } from './privacy.service';

const zList = z.object({
  status: z.string().max(20).optional(),
  kind: z.enum(['access', 'correction', 'closure']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
const zComplete = z.object({ note: z.string().max(2000).optional() });
const zReject = z.object({ note: z.string().trim().min(3).max(2000) });

/**
 * FR-IAM-008 — the privacy queue (DEC-041): staff work the data requests customers file from their
 * account. Org-wide on purpose — erasing or releasing a person's data is not a decision a
 * branch-limited role gets to make. Reading needs `customer.read`; acting needs `customer.manage`,
 * and completing (which can erase an account for good) asks for a fresh password.
 */
@ApiTags('privacy')
@OrgWide()
@Controller({ path: 'ops/privacy-requests', version: '1' })
export class PrivacyOpsController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @Permissions('customer.read', 'customer.manage')
  list(@Query(new ZodValidationPipe(zList)) q: z.infer<typeof zList>) {
    return this.privacy.opsList(q);
  }

  @Get(':id')
  @Permissions('customer.read', 'customer.manage')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.opsDetail(id);
  }

  @Post(':id/review')
  @Permissions('customer.manage')
  review(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.privacy.review(actor, id);
  }

  @Post(':id/complete')
  @Permissions('customer.manage')
  @StepUp()
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zComplete)) body: z.infer<typeof zComplete>,
    @CurrentActor() actor: Actor,
  ) {
    return this.privacy.complete(actor, id, body.note);
  }

  @Post(':id/reject')
  @Permissions('customer.manage')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zReject)) body: z.infer<typeof zReject>,
    @CurrentActor() actor: Actor,
  ) {
    return this.privacy.reject(actor, id, body.note);
  }
}
