import { zConsentSubmitRequest, type ConsentSubmitRequest } from '@carrental/contracts';
import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';

import { Public } from '../../common/auth/decorators';

import { ConsentService } from './consent.service';

class ConsentSubmitDto extends createZodDto(zConsentSubmitRequest) {}

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
  @ApiOperation({
    operationId: 'consent_submit',
    summary: 'Record a cookie/privacy consent choice (public)',
  })
  submit(
    @Body(new ZodValidationPipe(zConsentSubmitRequest)) body: ConsentSubmitDto,
    @Req() req: Request,
  ) {
    return this.consent.record(body as unknown as ConsentSubmitRequest, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }
}
