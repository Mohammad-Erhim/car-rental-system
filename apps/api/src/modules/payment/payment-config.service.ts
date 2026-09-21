import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { decryptSecret, encryptSecret, maskSecret } from '../../common/crypto/secret-cipher';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { organization } from '../../database/schema/org';
import { paymentProviderConfig } from '../../database/schema/payment';

import { PaymentPort, PaymentProviderConfigError, SimulatorPaymentAdapter } from './payment.port';
import { StripePaymentAdapter } from './stripe-payment.adapter';

export type PaymentDriver = 'simulator' | 'stripe_test' | 'stripe_live';

export interface PaymentConfigSummary {
  activeDriver: PaymentDriver;
  test: {
    configured: boolean;
    publishableKey: string | null;
    secretKeyLast4: string | null;
    configuredAt: string | null;
    verifiedAt: string | null;
    webhookConfigured: boolean;
  };
  live: {
    configured: boolean;
    publishableKey: string | null;
    secretKeyLast4: string | null;
    configuredAt: string | null;
    verifiedAt: string | null;
    acknowledged: boolean;
    webhookConfigured: boolean;
  };
  updatedAt: string | null;
}

export interface UpdatePaymentConfigInput {
  activeDriver?: PaymentDriver;
  test?: { publishableKey?: string; secretKey?: string; webhookSecret?: string };
  live?: {
    publishableKey?: string;
    secretKey?: string;
    webhookSecret?: string;
    /** an explicit, separate "yes I mean it" flag for turning on *live* mode specifically — real
     *  cards get charged real money the moment this is active (FR-PAY-010). */
    acknowledgeLive?: boolean;
  };
}

/**
 * SCREEN-OPS-041 — the dashboard-configurable payment provider switch (DEC-006 follow-up). One
 * row per organization. Secret keys are encrypted at rest (secret-cipher.ts) and never returned
 * to any API response in recoverable form — only a masked last-4 and a "configured" boolean. A
 * new key is verified against the real Stripe API (`balance.retrieve`, side-effect-free) before
 * it's ever saved, so a bad paste is caught immediately instead of on a guest's checkout.
 */
@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger('PaymentConfigService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** Makes a real, side-effect-free Stripe call with the given key and turns a rejection into a
   *  clean 422 the caller can show — `PaymentProviderConfigError` is a plain `Error`, not an
   *  `AppError`, so left uncaught it would fall through the global filter as a bare 500 instead
   *  of the specific "Stripe rejected this key" message an operator saving a settings form
   *  actually needs to see. */
  private async verifyOrThrow(secretKey: string): Promise<void> {
    try {
      await new StripePaymentAdapter(new Stripe(secretKey)).verifyKey();
    } catch (err) {
      if (err instanceof PaymentProviderConfigError) {
        throw new AppError('business_rule_violation', {
          title: err.message,
          params: { reason: 'invalid_stripe_key' },
        });
      }
      throw err;
    }
  }

  private async loadOrCreate() {
    const orgId = await this.orgId();
    const [row] = await this.db
      .select()
      .from(paymentProviderConfig)
      .where(eq(paymentProviderConfig.organizationId, orgId))
      .limit(1);
    if (row) return row;
    const [created] = await this.db
      .insert(paymentProviderConfig)
      .values({ organizationId: orgId, activeDriver: 'simulator' })
      .onConflictDoNothing({ target: paymentProviderConfig.organizationId })
      .returning();
    if (created) return created;
    // a concurrent first-load race created it first — read what's there now
    const [row2] = await this.db
      .select()
      .from(paymentProviderConfig)
      .where(eq(paymentProviderConfig.organizationId, orgId))
      .limit(1);
    return row2!;
  }

  /** The public-safe "which mode is live" read — checkout needs this to know whether to render
   *  a real Stripe Payment Element or the simulator's test-card picker, and which publishable
   *  key (never secret) to initialize Stripe.js with. */
  async getPublicMode(): Promise<{ driver: PaymentDriver; publishableKey: string | null }> {
    const row = await this.loadOrCreate();
    const driver = row.activeDriver as PaymentDriver;
    return {
      driver,
      publishableKey:
        driver === 'stripe_test'
          ? (row.testPublishableKey ?? null)
          : driver === 'stripe_live'
            ? (row.livePublishableKey ?? null)
            : null,
    };
  }

  async getSummary(): Promise<PaymentConfigSummary> {
    const row = await this.loadOrCreate();
    return {
      activeDriver: row.activeDriver as PaymentDriver,
      test: {
        configured: !!row.testSecretKeyCiphertext,
        publishableKey: row.testPublishableKey,
        secretKeyLast4: row.testSecretKeyLast4,
        configuredAt: row.testConfiguredAt,
        verifiedAt: row.testKeyVerifiedAt,
        webhookConfigured: !!row.testWebhookSecretCiphertext,
      },
      live: {
        configured: !!row.liveSecretKeyCiphertext,
        publishableKey: row.livePublishableKey,
        secretKeyLast4: row.liveSecretKeyLast4,
        configuredAt: row.liveConfiguredAt,
        verifiedAt: row.liveKeyVerifiedAt,
        acknowledged: row.liveModeAcknowledged,
        webhookConfigured: !!row.liveWebhookSecretCiphertext,
      },
      updatedAt: row.updatedAt,
    };
  }

  /**
   * The live `PaymentPort` for whichever driver is currently active — queried fresh on every
   * call (payments are a low-frequency operation; correctness after a just-made switch matters
   * far more here than shaving one query). Throws a clear, actionable error rather than
   * silently falling back to the simulator if "stripe_test"/"stripe_live" is selected but no key
   * is actually configured yet — an operator who flips the switch without saving a key must find
   * out from the very next checkout attempt failing loudly, not from unexplained silent
   * simulator charges.
   */
  async resolveActiveAdapter(): Promise<PaymentPort> {
    const row = await this.loadOrCreate();
    const driver = row.activeDriver as PaymentDriver;
    if (driver === 'simulator') return new SimulatorPaymentAdapter();
    const ciphertext =
      driver === 'stripe_test' ? row.testSecretKeyCiphertext : row.liveSecretKeyCiphertext;
    if (!ciphertext) {
      throw new AppError('business_rule_violation', {
        title: `Payments are set to ${driver.replace('_', ' ')} but no Stripe key is configured yet`,
        params: { reason: 'payment_provider_unconfigured' },
      });
    }
    const secretKey = decryptSecret(ciphertext);
    return new StripePaymentAdapter(
      new Stripe(secretKey),
      driver === 'stripe_live' ? 'live' : 'test',
      this.env.NODE_ENV,
    );
  }

  /** For the webhook endpoint — the currently-active mode's webhook signing secret, so a signed
   *  event can be verified against whichever mode is actually live right now. */
  async activeWebhookSecret(): Promise<string | null> {
    const row = await this.loadOrCreate();
    const driver = row.activeDriver as PaymentDriver;
    if (driver === 'stripe_test') {
      return row.testWebhookSecretCiphertext
        ? decryptSecret(row.testWebhookSecretCiphertext)
        : null;
    }
    if (driver === 'stripe_live') {
      return row.liveWebhookSecretCiphertext
        ? decryptSecret(row.liveWebhookSecretCiphertext)
        : null;
    }
    return null;
  }

  async update(actor: Actor, input: UpdatePaymentConfigInput): Promise<PaymentConfigSummary> {
    const orgId = await this.orgId();
    const row = await this.loadOrCreate();
    const patch: Record<string, unknown> = { updatedAt: sql`now()`, updatedBy: actor.accountId };
    const auditAfter: Record<string, unknown> = {};

    if (input.test?.secretKey) {
      // validated for real, before it's ever written — a mistyped or revoked key is rejected
      // right here, not discovered on a guest's actual checkout.
      await this.verifyOrThrow(input.test.secretKey);
      patch.testSecretKeyCiphertext = encryptSecret(input.test.secretKey);
      patch.testSecretKeyLast4 = maskSecret(input.test.secretKey);
      patch.testConfiguredAt = sql`now()`;
      patch.testKeyVerifiedAt = sql`now()`;
      auditAfter.testKeyChanged = true;
    }
    if (input.test?.publishableKey !== undefined) {
      patch.testPublishableKey = input.test.publishableKey || null;
    }
    if (input.test?.webhookSecret !== undefined) {
      patch.testWebhookSecretCiphertext = input.test.webhookSecret
        ? encryptSecret(input.test.webhookSecret)
        : null;
      auditAfter.testWebhookSecretChanged = true;
    }

    if (input.live?.secretKey) {
      await this.verifyOrThrow(input.live.secretKey);
      if (input.live.secretKey.startsWith('sk_test_')) {
        throw new AppError('business_rule_violation', {
          title:
            'That looks like a Stripe test key — live mode needs a live secret key (sk_live_…)',
          params: { reason: 'live_key_looks_like_test' },
        });
      }
      patch.liveSecretKeyCiphertext = encryptSecret(input.live.secretKey);
      patch.liveSecretKeyLast4 = maskSecret(input.live.secretKey);
      patch.liveConfiguredAt = sql`now()`;
      patch.liveKeyVerifiedAt = sql`now()`;
      auditAfter.liveKeyChanged = true;
    }
    if (input.live?.publishableKey !== undefined) {
      patch.livePublishableKey = input.live.publishableKey || null;
    }
    if (input.live?.webhookSecret !== undefined) {
      patch.liveWebhookSecretCiphertext = input.live.webhookSecret
        ? encryptSecret(input.live.webhookSecret)
        : null;
      auditAfter.liveWebhookSecretChanged = true;
    }
    if (input.live?.acknowledgeLive) patch.liveModeAcknowledged = true;

    if (input.activeDriver) {
      if (
        input.activeDriver === 'stripe_test' &&
        !row.testSecretKeyCiphertext &&
        !patch.testSecretKeyCiphertext
      ) {
        throw new AppError('business_rule_violation', {
          title: 'Save a Stripe test secret key before switching to Stripe test mode',
          params: { reason: 'no_test_key' },
        });
      }
      if (input.activeDriver === 'stripe_live') {
        if (!row.liveSecretKeyCiphertext && !patch.liveSecretKeyCiphertext) {
          throw new AppError('business_rule_violation', {
            title: 'Save a Stripe live secret key before switching to Stripe live mode',
            params: { reason: 'no_live_key' },
          });
        }
        if (!row.liveModeAcknowledged && !patch.liveModeAcknowledged) {
          throw new AppError('business_rule_violation', {
            title: 'Confirm you understand live mode charges real cards before switching to it',
            params: { reason: 'live_mode_not_acknowledged' },
          });
        }
      }
      patch.activeDriver = input.activeDriver;
      auditAfter.activeDriver = input.activeDriver;
    }

    await this.db
      .update(paymentProviderConfig)
      .set(patch)
      .where(eq(paymentProviderConfig.organizationId, orgId));

    await this.audit.record({
      action: 'payment.config.updated',
      targetType: 'payment_provider_config',
      targetId: orgId,
      actor,
      // never the key values themselves — only which fields changed and the new driver, if any
      after: auditAfter,
    });
    this.logger.log({ actorId: actor.accountId, ...auditAfter }, 'payment provider config updated');

    return this.getSummary();
  }
}
