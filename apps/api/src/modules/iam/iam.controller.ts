import {
  zChangePasswordRequest,
  zCompleteRecoveryRequest,
  zRegisterRequest,
  zSignInRequest,
  zStartRecoveryRequest,
  zUpdateProfileRequest,
  zVerifyContactRequest,
} from '@carrental/contracts';
import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../../common/app-error';
import {
  CurrentActor,
  MaybeCurrentActor,
  Public,
  RequireAudience,
} from '../../common/auth/auth.guard';
import type { Actor } from '../../common/auth/types';
import { CsrfGuard } from '../../common/security/csrf.guard';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import {
  refreshCookieName,
  resolveAudience,
  type AuthAudience,
} from '../../common/security/refresh-cookie-name';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

import {
  clearLegacyCookies,
  clearCsrfCookie,
  clearRefreshCookie,
  setCsrfCookie,
  setRefreshCookie,
} from './iam.cookies';
import { IamService } from './iam.service';
import { ProfileService } from './profile.service';

const zResend = z.object({ accountId: z.string().uuid() });
const zSignOut = z.object({ everywhere: z.boolean().default(false) });
const zAddDriver = z.object({
  role: z.enum(['primary_renter', 'additional', 'payer']).default('additional'),
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  licenceNumber: z.string().max(80).optional(),
  licenceCountry: z.string().max(2).optional(),
  licenceType: z.string().max(40).optional(),
  licenceExpiresOn: z.string().optional(),
});
const zDataRequest = z.object({
  kind: z.enum(['access', 'correction', 'closure']),
  detail: z.string().max(2000).optional(),
});

function ctxOf(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class IamController {
  constructor(
    private readonly iam: IamService,
    private readonly profiles: ProfileService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private issueCookie(
    res: Response,
    audience: AuthAudience,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const maxAgeMs = expiresAt.getTime() - Date.now();
    clearLegacyCookies(res, this.env);
    setRefreshCookie(res, this.env, audience, refreshToken, maxAgeMs);
    // Issued alongside the refresh cookie every time (not just at sign-in) — a session that
    // outlives a page's lifetime (a rolling refresh) must keep a matching CSRF cookie current too.
    setCsrfCookie(res, this.env, audience, maxAgeMs);
  }

  @Post('register')
  @Public()
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_register', summary: 'Create a customer account' })
  async register(
    @Body(new ZodValidationPipe(zRegisterRequest)) body: z.infer<typeof zRegisterRequest>,
  ) {
    const r = await this.iam.register(body);
    return {
      accountId: r.accountId,
      challengeId: r.challengeId,
      channel: r.channel,
      message: 'We sent a verification code to your email.',
      expiresAt: r.expiresAt,
      devCode: r.devCode,
    };
  }

  @Post('verify-contact')
  @Public()
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_verifyContact', summary: 'Verify email/phone with a code' })
  async verifyContact(
    @Body(new ZodValidationPipe(zVerifyContactRequest)) body: z.infer<typeof zVerifyContactRequest>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.iam.verifyContact(body.challengeId, body.code, ctxOf(req));
    this.issueCookie(res, 'customer', session.refreshToken, session.expiresAt); // register is customer-only
    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      actor: session.actor,
    };
  }

  @Post('resend-verification')
  @Public()
  @RateLimit({ preset: 'auth' })
  async resend(@Body(new ZodValidationPipe(zResend)) body: z.infer<typeof zResend>) {
    return this.iam.resendVerification(body.accountId);
  }

  @Post('sign-in')
  @Public()
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_signIn', summary: 'Sign in with credentials' })
  async signIn(
    @Body(new ZodValidationPipe(zSignInRequest)) body: z.infer<typeof zSignInRequest>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.iam.signIn(body, ctxOf(req));
    this.issueCookie(res, body.audience, session.refreshToken, session.expiresAt);
    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      actor: session.actor,
    };
  }

  @Post('refresh')
  @Public()
  @UseGuards(CsrfGuard)
  @ApiOperation({ operationId: 'auth_refresh', summary: 'Rotate the refresh session' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const audience = resolveAudience(req);
    const token = audience
      ? (req.cookies?.[refreshCookieName(audience)] as string | undefined)
      : undefined;
    if (!audience || !token) throw new AppError('auth_required', { title: 'No session' });
    try {
      const session = await this.iam.refresh(token, ctxOf(req), audience);
      this.issueCookie(res, audience, session.refreshToken, session.expiresAt);
      return {
        accessToken: session.accessToken,
        expiresInSeconds: session.expiresInSeconds,
        actor: session.actor,
      };
    } catch (err) {
      // A definitively dead session: drop its cookies so the browser stops presenting them.
      if (err instanceof AppError && err.code === 'auth_session_expired') {
        clearRefreshCookie(res, this.env, audience);
        clearCsrfCookie(res, this.env, audience);
      }
      throw err;
    }
  }

  @Post('sign-out')
  @Public()
  @UseGuards(CsrfGuard)
  @ApiOperation({ operationId: 'auth_signOut', summary: 'End the current (or all) sessions' })
  async signOut(
    @Body(new ZodValidationPipe(zSignOut)) body: z.infer<typeof zSignOut>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @MaybeCurrentActor() actor?: Actor,
  ) {
    const audience = resolveAudience(req) ?? actor?.audience ?? null;
    const token = audience
      ? (req.cookies?.[refreshCookieName(audience)] as string | undefined)
      : undefined;
    await this.iam.signOut(token, body.everywhere, actor?.accountId);
    // only this audience's cookies — signing out of the site must not end the ops session
    if (audience) {
      clearRefreshCookie(res, this.env, audience);
      clearCsrfCookie(res, this.env, audience);
    }
    clearLegacyCookies(res, this.env);
    return { ok: true };
  }

  @Post('recovery/start')
  @Public()
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_startRecovery', summary: 'Begin account recovery' })
  async startRecovery(
    @Body(new ZodValidationPipe(zStartRecoveryRequest)) body: z.infer<typeof zStartRecoveryRequest>,
  ) {
    return this.iam.startRecovery(body.email, body.audience);
  }

  @Post('recovery/complete')
  @Public()
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_completeRecovery', summary: 'Finish account recovery' })
  async completeRecovery(
    @Body(new ZodValidationPipe(zCompleteRecoveryRequest))
    body: z.infer<typeof zCompleteRecoveryRequest>,
  ) {
    await this.iam.completeRecovery(body.challengeId, body.code, body.newPassword);
    return { ok: true, message: 'Your password was reset. Please sign in.' };
  }

  @Post('change-password')
  @RateLimit({ preset: 'auth' })
  @ApiOperation({ operationId: 'auth_changePassword', summary: 'Change password (signed-in)' })
  async changePassword(
    @Body(new ZodValidationPipe(zChangePasswordRequest))
    body: z.infer<typeof zChangePasswordRequest>,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.iam.changePassword(actor.accountId, body.currentPassword, body.newPassword);
    clearRefreshCookie(res, this.env, actor.audience);
    clearCsrfCookie(res, this.env, actor.audience);
    clearLegacyCookies(res, this.env);
    return { ok: true, message: 'Password changed. Sign in again.' };
  }

  @Get('me/access')
  @ApiOperation({
    operationId: 'auth_myAccess',
    summary: 'My permissions, limits and scope right now (the session copy can be stale)',
  })
  myAccess(@CurrentActor() actor: Actor) {
    return this.iam.myAccess(actor);
  }

  @Get('me')
  @ApiOperation({ operationId: 'auth_me', summary: 'Current session actor + profile' })
  async me(@CurrentActor() actor: Actor) {
    return {
      actor,
      profile: actor.kind === 'customer' ? await this.profiles.getProfile(actor) : null,
    };
  }

  @Post('step-up')
  @RateLimit({ preset: 'auth' })
  @ApiOperation({
    operationId: 'auth_stepUp',
    summary: 'Re-confirm the password to satisfy a step-up-protected action',
  })
  stepUp(
    @Body(new ZodValidationPipe(z.object({ password: z.string().min(1).max(400) })))
    body: { password: string },
    @CurrentActor() actor: Actor,
  ) {
    return this.iam.stepUp(actor.accountId, body.password);
  }

  // ---- profile / preferences (FR-IAM-006) ----

  @Get('profile')
  @RequireAudience('customer')
  async getProfile(@CurrentActor() actor: Actor) {
    return this.profiles.getProfile(actor);
  }

  @Post('profile')
  @RequireAudience('customer')
  async updateProfile(
    @Body(new ZodValidationPipe(zUpdateProfileRequest)) body: z.infer<typeof zUpdateProfileRequest>,
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ) {
    const ifMatch = req.header('If-Match');
    return this.profiles.updateProfile(actor, body, ifMatch ? Number(ifMatch) : undefined);
  }

  // ---- saved drivers (FR-IAM-007) ----

  @Get('drivers')
  @RequireAudience('customer')
  listDrivers(@CurrentActor() actor: Actor) {
    return this.profiles.listDrivers(actor);
  }

  @Post('drivers')
  @RequireAudience('customer')
  addDriver(
    @Body(new ZodValidationPipe(zAddDriver)) body: z.infer<typeof zAddDriver>,
    @CurrentActor() actor: Actor,
  ) {
    return this.profiles.addDriver(actor, body);
  }

  @Post('drivers/:id/remove')
  @RequireAudience('customer')
  removeDriver(@CurrentActor() actor: Actor, @Req() req: Request) {
    return this.profiles.removeDriver(actor, req.params.id!);
  }

  // ---- account data requests / closure (FR-IAM-008) ----

  @Get('data-requests')
  @RequireAudience('customer')
  listDataRequests(@CurrentActor() actor: Actor) {
    return this.profiles.listDataRequests(actor);
  }

  @Post('data-requests')
  @RequireAudience('customer')
  createDataRequest(
    @Body(new ZodValidationPipe(zDataRequest)) body: z.infer<typeof zDataRequest>,
    @CurrentActor() actor: Actor,
  ) {
    return this.profiles.createDataRequest(actor, body.kind, body.detail);
  }

  @Post('data-requests/:id/cancel')
  @RequireAudience('customer')
  cancelDataRequest(@CurrentActor() actor: Actor, @Req() req: Request) {
    return this.profiles.cancelDataRequest(actor, req.params.id!);
  }
}
