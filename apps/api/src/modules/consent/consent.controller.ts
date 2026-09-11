import { zConsentSubmitRequest, type ConsentSubmitRequest } from '@carrental/contracts';
import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../../common/auth/decorators';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { ConsentService } from './consent.service';

/**
 * Public cookie/privacy consent capture. The browser keeps the visitor's choice in a first-party
 * cookie; it also calls this once per choice so the operator has an append-only record of what
 * was consented to, under which policy version, and when (GDPR Art. 7 accountability).
 */
@ApiTags('meta')
@Public()
@Controller({ path: 'consent', version: '1' })
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  // SRS-SEC-015 — this is a public, unauthenticated write into the append-only audit trail: with
  // no cap, a flood here doesn't just cost storage, it corrupts the GDPR opt-in stats this same
  // trail feeds (see ConsentService.log's summary). A real visitor never needs more than a
  // handful of choices a minute; a generous literal cap (not the `auth` preset — this is an abuse
  // control, not a credential-guessing one) still stops a scripted flood cold.
  @RateLimit({ bucket: 'consent-submit', limit: 20, windowSec: 60 })
  @ApiOperation({
    operationId: 'consent_submit',
    summary: 'Record a cookie/privacy consent choice (public)',
  })
  submit(
    @Body(new ZodValidationPipe(zConsentSubmitRequest)) body: ConsentSubmitRequest,
    @Req() req: Request,
  ) {
    return this.consent.record(body, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }
}
