import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

export interface SignedIn {
  accessToken: string;
  refreshCookie: string;
  actor: {
    accountId: string;
    kind: 'customer' | 'staff';
    permissions: string[];
    roleCodes: string[];
  };
}

function cookieFrom(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const hit = (raw ?? []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0]! : '';
}

/** Sign in a seeded account and return the tokens. */
export async function signIn(
  app: NestExpressApplication,
  email: string,
  password: string,
  audience: 'customer' | 'staff' = 'customer',
): Promise<SignedIn> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/sign-in')
    .send({ email, password, audience })
    .expect(201);
  return {
    accessToken: res.body.accessToken,
    refreshCookie: cookieFrom(res, 'carrental_rt'),
    actor: res.body.actor,
  };
}

export { cookieFrom };
