import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

export interface AccessClaims extends JWTPayload {
  sub: string; // account id
  kind: 'customer' | 'staff';
  aud: string;
  name: string;
  loc: string; // locale code
  jti: string;
}

/**
 * Short-lived signed access tokens + opaque refresh tokens (SRS-SEC-002).
 * Access tokens are HS256 with issuer/audience/purpose scoping; refresh tokens are random
 * 256-bit values stored only as sha-256 hashes server-side.
 */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  audienceFor(kind: 'customer' | 'staff'): string {
    return kind === 'staff' ? this.env.JWT_AUDIENCE_STAFF : this.env.JWT_AUDIENCE_CUSTOMER;
  }

  async signAccess(input: {
    accountId: string;
    kind: 'customer' | 'staff';
    displayName: string;
    localeCode: string;
  }): Promise<{ token: string; jti: string; expiresInSeconds: number }> {
    const jti = randomBytes(12).toString('hex');
    const token = await new SignJWT({
      kind: input.kind,
      name: input.displayName,
      loc: input.localeCode,
      jti,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.accountId)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.audienceFor(input.kind))
      .setIssuedAt()
      .setExpirationTime(`${this.env.JWT_ACCESS_TTL}s`)
      .sign(this.key);
    return { token, jti, expiresInSeconds: this.env.JWT_ACCESS_TTL };
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.env.JWT_ISSUER,
        audience: [this.env.JWT_AUDIENCE_CUSTOMER, this.env.JWT_AUDIENCE_STAFF],
      });
      return payload as AccessClaims;
    } catch {
      return null;
    }
  }

  /** Fresh opaque refresh token + its storage hash. The plaintext is only ever sent once. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefresh(token) };
  }

  hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }
}
