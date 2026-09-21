import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { maskEmail, maskPhone } from '../../common/mask';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  customer,
  customerMerge,
  customerRestriction,
  driver,
} from '../../database/schema/customer';
import { recoveryCase } from '../../database/schema/payment';
import { rental } from '../../database/schema/rental';
import { reservation } from '../../database/schema/reservation';

/**
 * SCREEN-OPS-021 / SCREEN-OPS-022 · FR-ADM-001 — customer record search + consolidated view
 * (read side). Staff search by a permitted identifier and open one consolidated record: contact,
 * preferences, consent, saved drivers, reservations, rentals, balance, open cases, and
 * eligibility restrictions. The restriction create/approve workflow (FR-ADM-002) and the
 * reversible duplicate merge (FR-ADM-001) live in `customer-restriction.service` /
 * `customer-merge.service`. Both `search` and `detail` are PII accesses on the audit trail
 * (SRS-SEC-016).
 */
@Injectable()
export class CustomerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /**
   * Search by name / email / phone fragment. Requires a query (no "list every customer"
   * enumeration — FR-ADM-001: "Ambiguous matches require refinement"). Contact detail is masked
   * in the list; the caller opens a record deliberately to see it in full.
   */
  async search(actor: Actor, q: string) {
    const term = q.trim();
    if (term.length < 2) {
      throw AppError.validation(
        [{ path: 'q', code: 'too_short', params: { min: 2 } }],
        'Enter at least 2 characters to search',
      );
    }
    const like = `%${term.toLowerCase()}%`;
    const rows = await this.db
      .select({
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        localeCode: customer.localeCode,
        createdAt: customer.createdAt,
      })
      .from(customer)
      .where(
        or(
          sql`lower(${customer.fullName}) like ${like}`,
          sql`lower(coalesce(${customer.emailNormalized}, ${customer.email})) like ${like}`,
          sql`lower(coalesce(${customer.phone}, '')) like ${like}`,
        ),
      )
      .orderBy(desc(customer.createdAt))
      .limit(25);

    // active-restriction flag per hit (so the list can badge "restricted")
    const ids = rows.map((r) => r.id);
    const restricted = ids.length
      ? new Set(
          (
            await this.db
              .select({ customerId: customerRestriction.customerId })
              .from(customerRestriction)
              .where(
                and(
                  inArray(customerRestriction.customerId, ids),
                  eq(customerRestriction.isActive, true),
                ),
              )
          ).map((r) => r.customerId),
        )
      : new Set<string>();

    // A customer lookup is a PII access — record who searched for what (SRS-SEC-016).
    await this.audit.record({
      action: 'customer.searched',
      targetType: 'customer',
      actor,
      outcome: 'accepted',
      after: { query: term, hits: rows.length },
    });

    return {
      query: term,
      count: rows.length,
      results: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        email: maskEmail(r.email),
        phone: maskPhone(r.phone),
        status: r.status,
        localeCode: r.localeCode,
        restricted: restricted.has(r.id),
      })),
    };
  }

  /** One consolidated customer record. Contact detail is returned in full (deliberate open). */
  async detail(actor: Actor, id: string) {
    const [c] = await this.db.select().from(customer).where(eq(customer.id, id)).limit(1);
    if (!c) throw AppError.notFound('customer');

    const drivers = c
      ? await this.db
          .select()
          .from(driver)
          .where(and(eq(driver.customerId, id), eq(driver.isSavedForReuse, true)))
      : [];

    const reservations = c.accountId
      ? await this.db
          .select({
            reference: reservation.reference,
            state: reservation.state,
            pickupAt: reservation.pickupAt,
            returnAt: reservation.returnAt,
            currency: reservation.currency,
            totalMinor: reservation.totalMinor,
            paidMinor: reservation.paidMinor,
          })
          .from(reservation)
          .where(eq(reservation.accountId, c.accountId))
          .orderBy(desc(reservation.pickupAt))
          .limit(50)
      : [];

    const resRefs = reservations.map((r) => r.reference);
    const rentals = resRefs.length
      ? await this.db
          .select({
            reference: rental.reference,
            reservationReference: rental.reservationReference,
            state: rental.state,
          })
          .from(rental)
          .where(inArray(rental.reservationReference, resRefs))
      : [];

    const restrictions = await this.db
      .select()
      .from(customerRestriction)
      .where(eq(customerRestriction.customerId, id))
      .orderBy(desc(customerRestriction.createdAt));

    // reversible-merge history: records where this customer absorbed a duplicate (FR-ADM-001)
    const merges = await this.db
      .select()
      .from(customerMerge)
      .where(eq(customerMerge.survivorId, id))
      .orderBy(desc(customerMerge.createdAt));

    const openCases = resRefs.length
      ? await this.db
          .select({
            id: recoveryCase.id,
            kind: recoveryCase.kind,
            state: recoveryCase.state,
            subjectRef: recoveryCase.subjectRef,
          })
          .from(recoveryCase)
          .where(and(inArray(recoveryCase.subjectRef, resRefs), eq(recoveryCase.state, 'open')))
      : [];

    // outstanding balance per currency — never sum minor units across currencies. The record
    // surfaces the largest single-currency debt (or the newest reservation's currency at zero).
    const owedByCurrency = new Map<string, number>();
    for (const res of reservations) {
      const owed = Math.max(0, res.totalMinor - res.paidMinor);
      if (owed > 0)
        owedByCurrency.set(res.currency, (owedByCurrency.get(res.currency) ?? 0) + owed);
    }
    const [balanceCurrency, balanceMinor] = [...owedByCurrency.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0] ?? [reservations[0]?.currency ?? 'USD', 0];

    // Opening a customer's consolidated record exposes unmasked contact detail, licence numbers
    // and address — a PII access that must be on the audit trail (SRS-SEC-016), like the search.
    await this.audit.record({
      action: 'customer.viewed',
      targetType: 'customer',
      targetId: id,
      actor,
      outcome: 'accepted',
    });

    return {
      id: c.id,
      accountId: c.accountId,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      localeCode: c.localeCode,
      timezone: c.timezone,
      address: c.address,
      communicationPrefs: c.communicationPrefs,
      consents: c.consents,
      status: c.status,
      mergedIntoId: c.mergedIntoId,
      createdAt: c.createdAt,
      mergeHistory: merges.map((m) => ({
        id: m.id,
        mergedId: m.mergedId,
        reason: m.reason,
        reversedAt: m.reversedAt,
        movedDrivers: m.movedDrivers.length,
        movedRestrictions: m.movedRestrictions.length,
        createdAt: m.createdAt,
      })),
      drivers: drivers.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        licenceNumber: d.licenceNumber,
        licenceCountry: d.licenceCountry,
        licenceExpiresOn: d.licenceExpiresOn,
        eligibilitySummary: d.eligibilitySummary,
      })),
      reservations,
      rentals,
      restrictions: restrictions.map((r) => ({
        id: r.id,
        category: r.category,
        scope: r.scope,
        reasonCode: r.reasonCode,
        evidenceRef: r.evidenceRef,
        status: r.status,
        reviewNotes: r.reviewNotes,
        createdBy: r.createdBy,
        approvedBy: r.approvedBy,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        isActive: r.isActive,
      })),
      openCases,
      balance: { currency: balanceCurrency, minor: balanceMinor },
    };
  }
}
