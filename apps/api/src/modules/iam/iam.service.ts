import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { ActorService } from '../../common/auth/actor.service';
import { PasswordService } from '../../common/auth/password.service';
import { RbacService } from '../../common/auth/rbac.service';
import { SessionService } from '../../common/auth/session.service';
import { TokenService } from '../../common/auth/token.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer } from '../../database/schema/customer';
import { account, staffProfile } from '../../database/schema/iam';

import { AccountRepo } from './account.repo';
import { VerificationService } from './verification.service';

const NEUTRAL = 'If an account matches, a message with the next step has been sent.';
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

interface SessionCtx {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class IamService {
  private readonly logger = new Logger('IamService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: AccountRepo,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly actors: ActorService,
    private readonly rbac: RbacService,
    private readonly verification: VerificationService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- registration

  async register(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    localeCode: string;
    marketingOptIn: boolean;
  }) {
    const emailNormalized = normEmail(input.email);
    const existing = await this.accounts.findByEmailNormalized(emailNormalized);

    if (existing) {
      // Do not create a duplicate; route to sign-in / recovery (FR-IAM-001).
      throw new AppError('business_rule_violation', {
        title: 'An account with this email already exists',
        params: { reason: 'account_exists' },
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    const [acc] = await this.db
      .insert(account)
      .values({
        kind: 'customer',
        email: input.email.trim(),
        emailNormalized,
        phone: input.phone,
        passwordHash,
        status: 'pending', // pending until contact verified
        displayName: input.fullName.trim(),
        localeCode: input.localeCode,
      })
      .returning();

    const org = await this.defaultOrgId();
    await this.db.insert(customer).values({
      accountId: acc!.id,
      organizationId: org,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      emailNormalized,
      phone: input.phone,
      localeCode: input.localeCode,
      communicationPrefs: { marketingEmail: input.marketingOptIn },
      consents: [
        { type: 'account_terms', version: '1.0', acceptedAt: new Date().toISOString() },
        ...(input.marketingOptIn
          ? [{ type: 'marketing', version: '1.0', acceptedAt: new Date().toISOString() }]
          : []),
      ],
    });

    const challenge = await this.verification.create({
      accountId: acc!.id,
      purpose: 'verify_email',
      channel: 'email',
      destination: input.email.trim(),
      localeCode: input.localeCode,
      notifyEvent: 'account_verification',
      variables: { name: input.fullName.trim() },
    });

    await this.audit.record({
      action: 'iam.account.registered',
      targetType: 'account',
      targetId: acc!.id,
      after: { email: emailNormalized, kind: 'customer', status: 'pending' },
    });

    return {
      accountId: acc!.id,
      challengeId: challenge.challengeId,
      channel: 'email' as const,
      expiresAt: challenge.expiresAt.toISOString(),
      devCode: challenge.devCode,
    };
  }

  async verifyContact(challengeId: string, code: string, ctx: SessionCtx) {
    const result = await this.verification.consume(challengeId, code);
    if (!result.ok) {
      const map: Record<string, AppError> = {
        not_found: new AppError('resource_not_found', { title: 'Verification not found' }),
        expired: new AppError('business_rule_violation', {
          title: 'This code has expired — request a new one',
          params: { reason: 'expired' },
        }),
        used: new AppError('business_rule_violation', {
          title: 'This code was already used',
          params: { reason: 'used' },
        }),
        incorrect: new AppError('validation_failed', {
          title: 'That code is not correct',
          fieldErrors: [{ path: 'code', code: 'incorrect' }],
        }),
        locked: new AppError('rate_limited', { title: 'Too many attempts — request a new code' }),
      };
      throw map[result.reason];
    }
    if (!result.accountId) throw new AppError('resource_not_found');

    const [acc] = await this.db
      .update(account)
      .set({
        emailVerifiedAt: sql`now()`,
        status: sql`case when ${account.status} = 'pending' then 'active' else ${account.status} end`,
        updatedAt: sql`now()`,
      })
      .where(eq(account.id, result.accountId))
      .returning();

    await this.audit.record({
      action: 'iam.contact.verified',
      targetType: 'account',
      targetId: acc!.id,
      after: { emailVerified: true },
    });

    return this.mintSession(acc!.id, ctx, { fullAuth: true });
  }

  async resendVerification(accountId: string) {
    const acc = await this.accounts.findById(accountId);
    if (!acc) throw new AppError('resource_not_found');
    if (acc.emailVerifiedAt) {
      return { message: 'Your email is already verified.', challengeId: null };
    }
    const challenge = await this.verification.create({
      accountId: acc.id,
      purpose: 'verify_email',
      channel: 'email',
      destination: acc.email,
      localeCode: acc.localeCode,
      notifyEvent: 'account_verification',
      variables: { name: acc.displayName },
    });
    return {
      message: 'A new code has been sent.',
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt.toISOString(),
      devCode: challenge.devCode,
    };
  }

  // --------------------------------------------------------------------- sign-in

  async signIn(
    input: { email: string; password: string; audience: 'customer' | 'staff' },
    ctx: SessionCtx,
  ) {
    const emailNormalized = normEmail(input.email);
    const acc = await this.accounts.findByEmailNormalized(emailNormalized);

    // constant-ish work whether or not the account exists (no enumeration)
    const hash =
      acc?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$0000000000000000000000000000000000000000000';
    const passwordOk = await this.passwords.verify(hash, input.password);

    if (!acc || !passwordOk) {
      if (acc) {
        const failed = acc.failedLoginCount + 1;
        await this.db
          .update(account)
          .set({
            failedLoginCount: failed,
            lockedUntil:
              failed >= MAX_FAILED_LOGINS
                ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
                : acc.lockedUntil,
            updatedAt: sql`now()`,
          })
          .where(eq(account.id, acc.id));
      }
      throw new AppError('auth_invalid_credentials', { title: 'Email or password is incorrect' });
    }

    if (acc.lockedUntil && new Date(acc.lockedUntil).getTime() > Date.now()) {
      throw new AppError('auth_account_locked', {
        title: 'This account is temporarily locked. Try again later or reset your password.',
      });
    }
    if (acc.status === 'suspended') {
      throw new AppError('auth_account_locked', { title: 'This account is suspended.' });
    }
    if (acc.status === 'closed') {
      throw new AppError('auth_invalid_credentials', { title: 'Email or password is incorrect' });
    }
    // The surface a session is minted for must match the account kind — one email is one
    // account of one kind, so there is no legitimate cross-surface sign-in. Rejecting both
    // directions keeps a staff/admin account (and its permissions) off the customer site and a
    // customer account out of the ops dashboard. The session is then always minted with an
    // audience equal to acc.kind (see mintSession).
    if (input.audience !== acc.kind) {
      throw new AppError('forbidden', {
        title:
          input.audience === 'staff'
            ? 'This is not a staff account. Use the customer site to sign in.'
            : 'This is a staff account. Use the operations dashboard to sign in.',
      });
    }

    // rehash if policy moved on
    if (this.passwords.needsRehash(acc.passwordHash!)) {
      const fresh = await this.passwords.hash(input.password);
      await this.db.update(account).set({ passwordHash: fresh }).where(eq(account.id, acc.id));
    }

    await this.db
      .update(account)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastSignInAt: sql`now()`,
        lastFullAuthAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(account.id, acc.id));

    await this.audit.record({
      action: 'iam.signin.succeeded',
      targetType: 'account',
      targetId: acc.id,
      surface: input.audience,
    });

    return this.mintSession(acc.id, ctx, { fullAuth: true });
  }

  async refresh(refreshToken: string, ctx: SessionCtx) {
    const rotated = await this.sessions.rotate(refreshToken, ctx);
    if (!rotated.ok) {
      throw new AppError('auth_session_expired', {
        title:
          rotated.reason === 'reused'
            ? 'Your session was ended for security. Please sign in again.'
            : 'Your session has expired. Please sign in again.',
      });
    }
    const session = await this.buildSessionResponse(rotated.accountId, rotated.issued);
    return {
      ...session,
      refreshToken: rotated.issued.refreshToken,
      expiresAt: rotated.issued.expiresAt,
    };
  }

  async signOut(refreshToken: string | undefined, everywhere: boolean, accountId?: string) {
    if (refreshToken) await this.sessions.revokeByToken(refreshToken, 'sign_out');
    if (everywhere && accountId) {
      const n = await this.sessions.revokeAllForAccount(accountId, 'sign_out_all');
      await this.audit.record({
        action: 'iam.signout.all',
        targetType: 'account',
        targetId: accountId,
        after: { revoked: n },
      });
    }
  }

  // -------------------------------------------------------------------- recovery

  async startRecovery(email: string, audience: 'customer' | 'staff') {
    const emailNormalized = normEmail(email);
    const acc = await this.accounts.findByEmailNormalized(emailNormalized);

    if (acc && (audience !== 'staff' || acc.kind === 'staff') && acc.status !== 'closed') {
      const challenge = await this.verification.create({
        accountId: acc.id,
        purpose: 'recover',
        channel: 'email',
        destination: acc.email,
        localeCode: acc.localeCode,
        notifyEvent: 'account_recovery',
        variables: { name: acc.displayName },
      });
      return {
        challengeId: challenge.challengeId,
        channel: 'email' as const,
        message: NEUTRAL,
        expiresAt: challenge.expiresAt.toISOString(),
        devCode: challenge.devCode,
      };
    }
    // neutral response for non-existent / ineligible accounts
    return { challengeId: null, channel: null, message: NEUTRAL, expiresAt: null };
  }

  async completeRecovery(challengeId: string, code: string, newPassword: string) {
    const result = await this.verification.consume(challengeId, code);
    if (!result.ok || !result.accountId || result.purpose !== 'recover') {
      throw new AppError('business_rule_violation', {
        title: 'This recovery link is invalid or has expired. Start again.',
        params: { reason: result.ok ? 'wrong_purpose' : result.reason },
      });
    }
    const hash = await this.passwords.hash(newPassword);
    const [acc] = await this.db
      .update(account)
      .set({
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        lastFullAuthAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(account.id, result.accountId))
      .returning();

    // invalidate all sessions (SRS-SEC-004) + notify the holder
    const revoked = await this.sessions.revokeAllForAccount(acc!.id, 'password_recovered');
    await this.verification
      .create({
        accountId: acc!.id,
        purpose: 'link_identity', // reuse as a notification-only path
        channel: 'email',
        destination: acc!.email,
        localeCode: acc!.localeCode,
        notifyEvent: 'security_alert',
        variables: { event: 'password_changed', name: acc!.displayName },
      })
      .catch(() => {});

    await this.audit.record({
      action: 'iam.account.recovered',
      targetType: 'account',
      targetId: acc!.id,
      after: { sessionsRevoked: revoked },
      reason: 'password recovery completed',
    });
  }

  async changePassword(accountId: string, currentPassword: string, newPassword: string) {
    const acc = await this.accounts.findById(accountId);
    if (!acc?.passwordHash) throw new AppError('resource_not_found');
    const ok = await this.passwords.verify(acc.passwordHash, currentPassword);
    if (!ok) {
      throw new AppError('validation_failed', {
        title: 'Your current password is not correct',
        fieldErrors: [{ path: 'currentPassword', code: 'incorrect' }],
      });
    }
    const hash = await this.passwords.hash(newPassword);
    await this.db
      .update(account)
      .set({ passwordHash: hash, lastFullAuthAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(account.id, accountId));
    await this.sessions.revokeAllForAccount(accountId, 'password_changed');
    await this.audit.record({
      action: 'iam.password.changed',
      targetType: 'account',
      targetId: accountId,
    });
  }

  /**
   * SRS-SEC-014 — re-confirm the current holder's password to satisfy a `@StepUp()` route.
   * On success `last_full_auth_at` is refreshed (the next request re-reads it from the account);
   * no new tokens are minted and existing sessions are untouched.
   */
  async stepUp(accountId: string, password: string): Promise<{ ok: true }> {
    const acc = await this.accounts.findById(accountId);
    if (!acc) throw new AppError('auth_required');
    const ok = acc.passwordHash ? await this.passwords.verify(acc.passwordHash, password) : false;
    if (!ok) {
      await this.audit.record({
        action: 'iam.step_up.failed',
        targetType: 'account',
        targetId: accountId,
        reason: 'wrong_password',
      });
      throw new AppError('validation_failed', {
        title: 'That password is not correct',
        fieldErrors: [{ path: 'password', code: 'incorrect' }],
      });
    }
    await this.db
      .update(account)
      .set({ lastFullAuthAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(account.id, accountId));
    await this.audit.record({
      action: 'iam.step_up',
      targetType: 'account',
      targetId: accountId,
    });
    return { ok: true };
  }

  // --------------------------------------------------------------------- helpers

  private async mintSession(accountId: string, ctx: SessionCtx, _opts: { fullAuth: boolean }) {
    const acc = await this.accounts.findById(accountId);
    const issued = await this.sessions.issue({
      accountId,
      audience: acc!.kind as 'customer' | 'staff',
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    const session = await this.buildSessionResponse(accountId, issued);
    return { ...session, refreshToken: issued.refreshToken, expiresAt: issued.expiresAt };
  }

  private async buildSessionResponse(accountId: string, _issued: { refreshToken: string }) {
    const acc = await this.accounts.findById(accountId);
    if (!acc) throw new AppError('resource_not_found');
    const access = await this.tokens.signAccess({
      accountId: acc.id,
      kind: acc.kind as 'customer' | 'staff',
      displayName: acc.displayName,
      localeCode: acc.localeCode,
    });

    let permissions: string[] = [];
    let roleCodes: string[] = [];
    let organizationId: string | undefined;
    let organizationName: string | undefined;
    let locationScope: string[] = [];
    if (acc.kind === 'staff') {
      const [profile] = await this.db
        .select()
        .from(staffProfile)
        .where(eq(staffProfile.accountId, acc.id))
        .limit(1);
      if (profile) {
        roleCodes = profile.roleCodes;
        organizationId = profile.organizationId;
        locationScope = profile.locationScope;
        permissions = await this.rbac.resolvePermissions(profile.roleCodes);
        const { organization } = await import('../../database/schema/org');
        const [org] = await this.db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, profile.organizationId))
          .limit(1);
        organizationName = org?.name;
      }
    }

    return {
      accessToken: access.token,
      expiresInSeconds: access.expiresInSeconds,
      actor: {
        accountId: acc.id,
        kind: acc.kind as 'customer' | 'staff',
        displayName: acc.displayName,
        localeCode: acc.localeCode,
        emailVerified: !!acc.emailVerifiedAt,
        permissions,
        roleCodes,
        organizationId,
        organizationName,
        locationScope,
      },
    };
  }

  private async defaultOrgId(): Promise<string> {
    const { organization } = await import('../../database/schema/org');
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('policy_not_configured', { title: 'No organization configured' });
    return org.id;
  }

  currentActorAccountEmailNorm = normEmail;
}
