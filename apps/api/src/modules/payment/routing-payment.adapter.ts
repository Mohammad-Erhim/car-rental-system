import { Injectable } from '@nestjs/common';

import { PaymentConfigService } from './payment-config.service';
import {
  PaymentPort,
  type AuthorizeInput,
  type PaymentResult,
  type RefundContext,
  type ResumeOutcome,
} from './payment.port';

/**
 * The `PaymentPort` bound into the app's DI container (payment.module.ts) — every call is routed
 * to whichever driver `PaymentConfigService` says is currently active, resolved fresh each time
 * rather than baked into a fixed adapter at boot. This is what makes the dashboard's payment
 * driver switch (SCREEN-OPS-041) take effect immediately, with no redeploy and no restart.
 */
@Injectable()
export class RoutingPaymentAdapter extends PaymentPort {
  constructor(private readonly config: PaymentConfigService) {
    super();
  }

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.authorize(input);
  }

  async capture(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
  ): Promise<PaymentResult> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.capture(providerRef, amountMinor, idempotencyKey);
  }

  async resume(providerRef: string, token?: string): Promise<ResumeOutcome> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.resume(providerRef, token);
  }

  async void(providerRef: string): Promise<void> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.void(providerRef);
  }

  async forgetCustomer(customerRef: string): Promise<void> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.forgetCustomer(customerRef);
  }

  async refund(
    providerRef: string,
    amountMinor: number,
    idempotencyKey?: string,
    context?: RefundContext,
  ): Promise<PaymentResult> {
    const adapter = await this.config.resolveActiveAdapter();
    return adapter.refund(providerRef, amountMinor, idempotencyKey, context);
  }
}
