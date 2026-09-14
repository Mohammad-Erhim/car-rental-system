import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import nodemailer from 'nodemailer';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { decryptSecret, encryptSecret, maskSecret } from '../../common/crypto/secret-cipher';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { emailProviderConfig } from '../../database/schema/notify';
import { organization } from '../../database/schema/org';

export type EmailDriver = 'outbox' | 'smtp';

export interface EmailConfigSummary {
  activeDriver: EmailDriver;
  smtp: {
    configured: boolean;
    host: string | null;
    port: number | null;
    secure: boolean;
    username: string | null;
    passwordLast4: string | null;
    fromAddress: string | null;
    fromName: string | null;
    configuredAt: string | null;
    verifiedAt: string | null;
  };
  updatedAt: string | null;
}

export interface UpdateEmailConfigInput {
  activeDriver?: EmailDriver;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    fromAddress?: string;
    fromName?: string;
  };
}

/**
 * The dashboard-configurable email provider switch — mirrors `PaymentConfigService`. One row per
 * organization. The `outbox` driver (dev/simulator) persists every message to `notification` and
 * never dispatches a real carrier (visible at /ops/dev/mail); `smtp` sends for real via
 * `NotifyService`. The SMTP password is encrypted at rest (secret-cipher.ts) and never returned
 * to any API response in recoverable form. A new host/credential is verified against a real SMTP
 * connection (`transporter.verify()`, side-effect-free — no message is sent) before it's ever
 * saved, so a bad paste is caught immediately instead of on the next customer email.
 */
@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger('EmailConfigService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  private async verifyOrThrow(cfg: {
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
  }): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    });
    try {
      await transporter.verify();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      throw new AppError('business_rule_violation', {
        title: `Could not connect to that SMTP server: ${msg}`,
        params: { reason: 'invalid_smtp_config' },
      });
    } finally {
      transporter.close();
    }
  }

  private async loadOrCreate() {
    const orgId = await this.orgId();
    const [row] = await this.db
      .select()
      .from(emailProviderConfig)
      .where(eq(emailProviderConfig.organizationId, orgId))
      .limit(1);
    if (row) return row;
    const [created] = await this.db
      .insert(emailProviderConfig)
      .values({ organizationId: orgId, activeDriver: 'outbox' })
      .onConflictDoNothing({ target: emailProviderConfig.organizationId })
      .returning();
    if (created) return created;
    const [row2] = await this.db
      .select()
      .from(emailProviderConfig)
      .where(eq(emailProviderConfig.organizationId, orgId))
      .limit(1);
    return row2!;
  }

  async getSummary(): Promise<EmailConfigSummary> {
    const row = await this.loadOrCreate();
    return {
      activeDriver: row.activeDriver as EmailDriver,
      smtp: {
        configured: !!row.smtpPasswordCiphertext,
        host: row.smtpHost,
        port: row.smtpPort,
        secure: row.smtpSecure,
        username: row.smtpUsername,
        passwordLast4: row.smtpPasswordLast4,
        fromAddress: row.fromAddress,
        fromName: row.fromName,
        configuredAt: row.configuredAt,
        verifiedAt: row.verifiedAt,
      },
      updatedAt: row.updatedAt,
    };
  }

  /** The live SMTP transport settings for `NotifyService` — `null` when the active driver isn't
   *  `smtp` or no credential is saved yet (the caller falls back to the outbox driver). */
  async resolveActiveSmtp(): Promise<{
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
    fromAddress: string;
    fromName: string | null;
  } | null> {
    const row = await this.loadOrCreate();
    if (row.activeDriver !== 'smtp') return null;
    if (!row.smtpHost || !row.smtpPort || !row.fromAddress) return null;
    return {
      host: row.smtpHost,
      port: row.smtpPort,
      secure: row.smtpSecure,
      username: row.smtpUsername ?? undefined,
      password: row.smtpPasswordCiphertext ? decryptSecret(row.smtpPasswordCiphertext) : undefined,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
    };
  }

  async update(actor: Actor, input: UpdateEmailConfigInput): Promise<EmailConfigSummary> {
    const orgId = await this.orgId();
    const row = await this.loadOrCreate();
    const patch: Record<string, unknown> = { updatedAt: sql`now()`, updatedBy: actor.accountId };
    const auditAfter: Record<string, unknown> = {};

    if (input.smtp?.host !== undefined) patch.smtpHost = input.smtp.host || null;
    if (input.smtp?.port !== undefined) patch.smtpPort = input.smtp.port;
    if (input.smtp?.secure !== undefined) patch.smtpSecure = input.smtp.secure;
    if (input.smtp?.username !== undefined) patch.smtpUsername = input.smtp.username || null;
    if (input.smtp?.fromAddress !== undefined) patch.fromAddress = input.smtp.fromAddress || null;
    if (input.smtp?.fromName !== undefined) patch.fromName = input.smtp.fromName || null;
    if (input.smtp?.password) {
      patch.smtpPasswordCiphertext = encryptSecret(input.smtp.password);
      patch.smtpPasswordLast4 = maskSecret(input.smtp.password);
      auditAfter.passwordChanged = true;
    }

    const wantsSmtpActive = input.activeDriver === 'smtp';
    const hasNewHost = input.smtp?.host || input.smtp?.port;
    if (wantsSmtpActive || hasNewHost) {
      const host = (patch.smtpHost as string | undefined) ?? row.smtpHost;
      const port = (patch.smtpPort as number | undefined) ?? row.smtpPort;
      const secure = (patch.smtpSecure as boolean | undefined) ?? row.smtpSecure;
      const username = (patch.smtpUsername as string | undefined) ?? row.smtpUsername;
      const password = input.smtp?.password
        ? input.smtp.password
        : row.smtpPasswordCiphertext
          ? decryptSecret(row.smtpPasswordCiphertext)
          : undefined;
      const hasFromAddress = !!patch.fromAddress || !!row.fromAddress;
      if (wantsSmtpActive && (!host || !port || !hasFromAddress)) {
        throw AppError.businessRule(
          'Save an SMTP host, port, and from-address before switching to SMTP',
          { reason: 'incomplete_smtp_config' },
        );
      }
      if (host && port) {
        await this.verifyOrThrow({ host, port, secure, username: username ?? undefined, password });
        patch.verifiedAt = sql`now()`;
        patch.configuredAt = sql`now()`;
      }
    }

    if (input.activeDriver) {
      patch.activeDriver = input.activeDriver;
      auditAfter.activeDriver = input.activeDriver;
    }

    await this.db
      .update(emailProviderConfig)
      .set(patch)
      .where(eq(emailProviderConfig.organizationId, orgId));

    await this.audit.record({
      action: 'email.config.updated',
      targetType: 'email_provider_config',
      targetId: orgId,
      actor,
      after: auditAfter,
    });
    this.logger.log({ actorId: actor.accountId, ...auditAfter }, 'email provider config updated');

    return this.getSummary();
  }
}
