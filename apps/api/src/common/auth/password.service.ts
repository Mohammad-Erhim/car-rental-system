import { Inject, Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

/**
 * Argon2id password hashing (SRS-SEC-001). Parameters are configurable and a successful
 * sign-in triggers a rehash when the policy has moved on. A per-deployment pepper is mixed in.
 */
const PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private pepper(plain: string): string {
    return `${plain}${this.env.PASSWORD_PEPPER}`;
  }

  async hash(plain: string): Promise<string> {
    return hash(this.pepper(plain), PARAMS);
  }

  async verify(stored: string, plain: string): Promise<boolean> {
    try {
      return await verify(stored, this.pepper(plain));
    } catch {
      return false;
    }
  }

  /** True when the stored hash was made with weaker-than-current parameters. */
  needsRehash(stored: string): boolean {
    const m = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)/.exec(stored);
    if (!m) return true;
    const [, mem, time, par] = m;
    return (
      Number(mem) < PARAMS.memoryCost ||
      Number(time) < PARAMS.timeCost ||
      Number(par) < PARAMS.parallelism
    );
  }
}
