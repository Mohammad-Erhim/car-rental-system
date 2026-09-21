import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { paymentIntent } from '../../database/schema/payment';
import { reservation } from '../../database/schema/reservation';

import { PaymentPort } from './payment.port';

/** What other modules may use from payment (SRS-ARC-001). */
@Injectable()
export class PaymentPublic {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly port: PaymentPort,
  ) {}

  /**
   * Remove the payment processor's copy of the cards an account saved (a closed account, DEC-041).
   * Each customer the processor holds is deleted; on success the refs are cleared from our
   * payments too, so nothing can be charged to them again. A customer the processor could not be
   * asked to delete keeps its ref (so it can be retried) and is reported back in `failed` — the
   * caller decides whether that stops what it is doing.
   */
  async forgetSavedCards(accountId: string): Promise<{ forgotten: number; failed: string[] }> {
    const rows = await this.db
      .selectDistinct({ ref: paymentIntent.providerCustomerRef })
      .from(paymentIntent)
      .innerJoin(reservation, eq(reservation.reference, paymentIntent.reservationReference))
      .where(
        and(eq(reservation.accountId, accountId), isNotNull(paymentIntent.providerCustomerRef)),
      );
    const forgotten: string[] = [];
    const failed: string[] = [];
    for (const { ref } of rows) {
      if (!ref) continue;
      try {
        await this.port.forgetCustomer(ref);
        forgotten.push(ref);
      } catch {
        failed.push(ref);
      }
    }
    if (forgotten.length) {
      await this.db
        .update(paymentIntent)
        .set({ providerCustomerRef: null, providerMethodRef: null })
        .where(inArray(paymentIntent.providerCustomerRef, forgotten));
    }
    return { forgotten: forgotten.length, failed };
  }
}
