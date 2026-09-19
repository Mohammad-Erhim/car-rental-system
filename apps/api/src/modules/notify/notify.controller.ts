import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Public } from '../../common/auth/decorators';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

import { NotificationRuleService } from './notification-rule.service';
import { NotifyService } from './notify.service';
import { TemplateService } from './template.service';

/** Dev-only mail/message viewer (DEC-016). Disabled outside development. */
@ApiExcludeController()
@Controller('dev/mail')
export class DevMailController {
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

const zVar = z.object({
  name: z.string().min(1).max(60),
  required: z.boolean().optional(),
  legal: z.boolean().optional(),
});
const zDraft = z.object({
  key: z.string().min(1).max(80),
  channel: z.string().min(1).max(20),
  localeCode: z.string().min(2).max(10),
  subject: z.string().max(300).nullish(),
  bodyTemplate: z.string().min(1).max(20000),
  variables: z.array(zVar).max(50),
  note: z.string().max(1000).optional(),
});
const zPreview = z.object({
  subject: z.string().max(300).nullish(),
  bodyTemplate: z.string().min(1).max(20000),
  variables: z.array(zVar).max(50),
  sample: z.record(z.unknown()).optional(),
});

const zRule = z.object({
  event: z.string().min(1).max(80),
  channel: z.string().min(1).max(20).optional(),
  enabled: z.boolean().optional(),
  audience: z.enum(['primary_renter', 'account_holder', 'all_drivers', 'ops']).optional(),
  delayMinutes: z.number().int().min(0).max(100_000).optional(),
  quietHours: z
    .object({
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .nullable()
    .optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  retryBackoffMinutes: z.number().int().min(0).max(10_080).optional(),
  escalateAfterAttempts: z.number().int().min(1).max(20).nullable().optional(),
  // local-part of the From identity only (e.g. 'bookings') — never free text: this can end up in
  // a mail header once a real SMTP driver exists, so no whitespace/control/'@'/CRLF is accepted.
  senderIdentity: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
    .nullable()
    .optional(),
});

/** SCREEN-OPS-033 / FR-ADM-011 — notification template administration (content half). */
@ApiTags('admin')
@OrgWide()
@Controller({ path: 'ops', version: '1' })
export class TemplateController {
  constructor(
    private readonly templates: TemplateService,
    private readonly rules: NotificationRuleService,
  ) {}

  // --- event rules (FR-ADM-011, trigger / audience / timing / retry / escalation / sender) ---

  @Get('notification-rules')
  @Permissions('config.read', 'config.publish')
  listRules() {
    return this.rules.list();
  }

  @Get('notification-rules/:event/:channel')
  @Permissions('config.read', 'config.publish')
  getRule(@Param('event') event: string, @Param('channel') channel: string) {
    return this.rules.get(event, channel);
  }

  @Post('notification-rules')
  @Permissions('config.publish')
  upsertRule(
    @Body(new ZodValidationPipe(zRule)) body: z.infer<typeof zRule>,
    @CurrentActor() actor: Actor,
  ) {
    return this.rules.upsert(actor, body);
  }

  @Post('notification-rules/:event/:channel/enable')
  @Permissions('config.publish')
  enableRule(
    @Param('event') event: string,
    @Param('channel') channel: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.rules.setEnabled(actor, event, channel, true);
  }

  @Post('notification-rules/:event/:channel/disable')
  @Permissions('config.publish')
  disableRule(
    @Param('event') event: string,
    @Param('channel') channel: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.rules.setEnabled(actor, event, channel, false);
  }

  @Get('templates')
  @Permissions('config.read', 'config.publish')
  list() {
    return this.templates.list();
  }

  @Get('templates/:key/:channel/readiness')
  @Permissions('config.read', 'config.publish')
  readiness(@Param('key') key: string, @Param('channel') channel: string) {
    return this.templates.readiness(key, channel);
  }

  @Get('templates/:key/:channel/:locale')
  @Permissions('config.read', 'config.publish')
  get(
    @Param('key') key: string,
    @Param('channel') channel: string,
    @Param('locale') locale: string,
  ) {
    return this.templates.get(key, channel, locale);
  }

  @Post('templates/draft')
  @Permissions('config.publish')
  draft(
    @Body(new ZodValidationPipe(zDraft)) body: z.infer<typeof zDraft>,
    @CurrentActor() actor: Actor,
  ) {
    return this.templates.saveDraft(actor, body);
  }

  @Post('templates/preview')
  @Permissions('config.read', 'config.publish')
  preview(@Body(new ZodValidationPipe(zPreview)) body: z.infer<typeof zPreview>) {
    return this.templates.preview(body);
  }

  @Post('templates/:id/submit')
  @Permissions('config.publish')
  submit(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.templates.submit(actor, id);
  }

  @Post('templates/:id/publish')
  @Permissions('config.publish')
  publish(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.templates.publish(actor, id);
  }
}
