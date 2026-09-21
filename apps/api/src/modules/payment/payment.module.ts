import { Module } from '@nestjs/common';

import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';
import { PaymentPort } from './payment.port';
import { PaymentPublic } from './payment.public';
import { PaymentService } from './payment.service';
import { RoutingPaymentAdapter } from './routing-payment.adapter';
import { StripeWebhookController } from './stripe-webhook.controller';

/**
 * STAGE-003 — payments. `PaymentPort` is bound to `RoutingPaymentAdapter`, which resolves the
 * *actually active* driver (simulator, Stripe test, or Stripe live) from `PaymentConfigService`
 * on every call — the dashboard-configurable switch (SCREEN-OPS-041) takes effect immediately,
 * no redeploy. `PaymentConfigController` exposes that settings screen (admin-only,
 * `payment.manage`, step-up-confirmed); `StripeWebhookController` handles the async side of a
 * real Stripe integration (signature-verified event handling, reconciliation on anomalies).
 */
@Module({
  controllers: [PaymentConfigController, StripeWebhookController],
  providers: [
    PaymentService,
    PaymentConfigService,
    PaymentPublic,
    RoutingPaymentAdapter,
    { provide: PaymentPort, useExisting: RoutingPaymentAdapter },
  ],
  exports: [PaymentService, PaymentConfigService, PaymentPublic],
})
export class PaymentModule {}
