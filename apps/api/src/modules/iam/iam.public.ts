import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer } from '../../database/schema/customer';

import { AccountRepo } from './account.repo';
import { VerificationService } from './verification.service';

/**
 * IAM's public surface for other domain modules (SRS-ARC-001). Other modules must import this,
 * never IAM internals.
 */
@Injectable()
export class IamPublic {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: AccountRepo,
    private readonly verification: VerificationService,
  ) {}

  /** Send a set-password / recovery challenge to a (staff) invitee. */
  async sendInviteChallenge(input: { accountId: string; email: string; name: string }) {
    return this.verification.create({
      accountId: input.accountId,
      purpose: 'recover',
      channel: 'email',
      destination: input.email,
      notifyEvent: 'account_recovery',
      variables: { name: input.name, invite: true },
    });
  }

  async accountSummary(accountId: string) {
    const acc = await this.accounts.findById(accountId);
    if (!acc) return null;
    return {
      id: acc.id,
      kind: acc.kind as 'customer' | 'staff',
      displayName: acc.displayName,
      email: acc.email,
      localeCode: acc.localeCode,
      status: acc.status,
      emailVerified: !!acc.emailVerifiedAt,
    };
  }

  async customerIdForAccount(accountId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, accountId))
      .limit(1);
    return row?.id ?? null;
  }
}
