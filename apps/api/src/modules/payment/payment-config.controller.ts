import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor, OptionalAuth } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { PaymentConfigService } from './payment-config.service';

const zModeSummary = z.object({
  publishableKey: z.string().min(1).optional(),
  secretKey: z.string().min(1).optional(),
  webhookSecret: z.string().min(1).optional(),
});
const zUpdate = z.object({
  activeDriver: z.enum(['simulator', 'stripe_test', 'stripe_live']).optional(),
  test: zModeSummary.optional(),
  live: zModeSummary.extend({ acknowledgeLive: z.boolean().optional() }).optional(),
});

/**
 * SCREEN-OPS-041 — the payment provider settings screen. Every write is `payment.manage`-gated
 * (administrator only — deliberately excluded from the generic 'ALL' role grant every other
 * admin permission gets, per explicit requirement: this is the one screen in the app that can
 * move real money) and step-up-confirmed (a fresh password, same as sending a report schedule
 * or approving config). `GET` is gated the same way — even *seeing* whether live mode is
 * configured, and by whom, is scoped to the same narrow audience as changing it.
 */
@ApiTags('ops-payments')
@Controller({ path: 'ops/payments', version: '1' })
export class PaymentConfigController {
  constructor(private readonly config: PaymentConfigService) {}

  @Get('config')
  @Permissions('payment.manage')
  getConfig() {
    return this.config.getSummary();
  }

  @Put('config')
  @Permissions('payment.manage')
  @StepUp()
  async updateConfig(
    @Body(new ZodValidationPipe(zUpdate)) body: z.infer<typeof zUpdate>,
    @CurrentActor() actor: Actor,
  ) {
    return this.config.update(actor, body);
  }

  // Public — the customer checkout needs to know which mode is live and, if Stripe, the
  // publishable key to initialize Stripe.js with (never the secret key; publishable keys are
  // designed to be public by Stripe's own model).
  @Get('mode')
  @OptionalAuth()
  getMode() {
    return this.config.getPublicMode();
  }
}
