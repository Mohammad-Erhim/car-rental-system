import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { EmailConfigService } from './email-config.service';

// Same header-injection defense as notification-rule's `senderIdentity` (notify.controller.ts),
// scoped to each field's legitimate format: no CR/LF/NUL/other control characters can ever reach
// nodemailer's From header, whichever field they arrive through. `fromName` is a free-text
// display name (unlike senderIdentity's bare mail-local-part) so it keeps spaces/punctuation —
// only control characters and the quote character (which would otherwise let a crafted name break
// out of a hand-built quoted string) are rejected; `sendSmtp` also now passes a structured
// `{name, address}` object to nodemailer rather than interpolating a string, so this is
// defense-in-depth, not the only guard. A plain char-code scan (not a regex literal) — control
// characters trip ESLint's `no-control-regex` when spelled as a `\x00-\x1f` regex class.
function hasHeaderInjectionChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || value[i] === '"') return true;
  }
  return false;
}

const zUpdate = z.object({
  activeDriver: z.enum(['outbox', 'smtp']).optional(),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      secure: z.boolean().optional(),
      username: z.string().optional(),
      password: z.string().min(1).optional(),
      fromAddress: z
        .string()
        .trim()
        .max(320)
        .email()
        .refine((v) => !hasHeaderInjectionChars(v), 'invalid characters in from-address')
        .optional(),
      fromName: z
        .string()
        .trim()
        .max(200)
        .refine((v) => !hasHeaderInjectionChars(v), 'invalid characters in from-name')
        .optional(),
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
@OrgWide()
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
