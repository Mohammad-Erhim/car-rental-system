import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { isUniqueViolation } from '../../common/db-error';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { hold } from '../../database/schema/booking';
import { customer } from '../../database/schema/customer';
import { account } from '../../database/schema/iam';
import { location, organization } from '../../database/schema/org';
import {
  consentSnapshot,
  reservation,
  reservationDriver,
  reservationLine,
} from '../../database/schema/reservation';
import { ProductService } from '../catalogue/product.service';
import { ConfigVersionService } from '../config/config-version.service';
import { CustomerRestrictionService } from '../customer/customer-restriction.service';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';
import { PricingService } from '../pricing/pricing.service';

const TERMS_VERSION = '1.0';

export interface DriverInput {
  role?: 'primary_renter' | 'additional' | 'payer';
  savedDriverId?: string;
  fullName: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  licenceNumber?: string;
  licenceCountry?: string;
  licenceExpiresOn?: string;
}

export interface ConfirmInput {
  quoteReference: string;
  actor: Actor | null;
  holderKey?: string;
  drivers: DriverInput[];
  /** Selected extras by catalogue code only — priced server-side (S7-DEF-004). */
  extraCodes?: string[];
  acceptTerms: boolean;
  paymentToken: string;
  /** test-only fault injection: throw after a successful capture to exercise TEST-ERR-004 */
  simulateWriteFailure?: boolean;
  ipHash?: string;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger('BookingService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly products: ProductService,
    private readonly restrictions: CustomerRestrictionService,
    private readonly payments: PaymentService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigVersionService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** Deterministic reservation reference for a quote — a retry computes the same ref, which
   *  keeps the payment idempotency key stable (FR-BKG-004 / FR-PAY-002). */
  private refFor(quoteReference: string): string {
    const suffix = createHash('sha256')
      .update(quoteReference)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();
    return `RES-${suffix}`;
  }

  async confirm(input: ConfirmInput) {
    if (!input.acceptTerms) {
      throw AppError.businessRule('The rental terms must be accepted to confirm', {
        reason: 'terms_not_accepted',
      });
    }
    if (
      !input.drivers?.length ||
      !input.drivers.some((d) => (d.role ?? 'primary_renter') === 'primary_renter')
    ) {
      throw AppError.validation(
        [{ path: 'drivers', code: 'primary_driver_required' }],
        'A primary driver is required',
      );
    }

    const orgId = await this.orgId();
    const reference = this.refFor(input.quoteReference);

    // ---- idempotency: a reservation for this quote already exists ----
    const [existing] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reference))
      .limit(1);
    if (existing) {
      return this.getReservation(reference, input.actor);
    }

    // ---- quote must still be valid ----
    const quote = await this.pricing.getQuote(input.quoteReference);
    if (quote.status === 'expired' || new Date(quote.expiresAt).getTime() < Date.now()) {
      throw new AppError('quote_expired', {
        title: 'That price has expired — please search again',
        params: { reason: 'quote_expired' },
      });
    }
    if (quote.status !== 'active') {
      throw AppError.businessRule('That quote can no longer be booked', { reason: quote.status });
    }

    // ---- eligibility restriction (FR-ADM-002) ----
    // An active `block` restriction on the booking customer denies the booking. Applies to a
    // customer booking for themselves; a staff-assisted booking surfaces the badge in the ops
    // record instead (the driver's identity is not asserted here).
    if (input.actor?.kind === 'customer') {
      const [cust] = await this.db
        .select({ id: customer.id })
        .from(customer)
        .where(eq(customer.accountId, input.actor.accountId))
        .limit(1);
      if (cust) {
        await this.restrictions.assertCanTransact(cust.id, {
          categoryCode: quote.categoryCode,
          locationCode: quote.pickupLocationCode,
          at: new Date(quote.pickupAt),
        });
      }
    }

    // ---- hold must still be live ----
    let heldUnitPinned = false;
    if (quote.holdId) {
      const [h] = await this.db.select().from(hold).where(eq(hold.id, quote.holdId)).limit(1);
      if (!h || h.status !== 'active' || new Date(h.expiresAt).getTime() < Date.now()) {
        throw new AppError('availability_lost', {
          title: 'Your held vehicle was released — please search again',
          params: { reason: 'hold_expired' },
        });
      }
      heldUnitPinned = true;
    }

    // ---- extras / protection (FR-ADM-006, S7-DEF-004) ----
    // The client only names catalogue codes; `ProductService` resolves each to an active,
    // in-scope `product` and prices it — the request body never carries a price or label. Each
    // priced line is snapshotted into the reservation so a later catalogue change never rewrites
    // a past agreement. Extras are taxed at the same effective rate as the quote's taxable base.
    const extras = await this.products.resolveForBooking({
      extraCodes: input.extraCodes ?? [],
      categoryCode: quote.categoryCode,
      pickupLocationCode: quote.pickupLocationCode,
      currency: quote.currency,
      durationHours: quote.durationHours,
    });
    const extrasTaxableMinor = extras
      .filter((e) => e.taxable)
      .reduce((a, e) => a + e.amountMinor, 0);
    const extrasMinor = extras.reduce((a, e) => a + e.amountMinor, 0);
    const quoteTaxableMinor = quote.lines
      .filter((l) => l.kind !== 'tax')
      .reduce((a, l) => a + l.amountMinor, 0);
    const effRateBps =
      quoteTaxableMinor > 0 ? Math.round((quote.taxMinor / quoteTaxableMinor) * 10_000) : 0;
    const extrasTaxMinor = Math.round((extrasTaxableMinor * effRateBps) / 10_000);

    const subtotalMinor = quote.subtotalMinor + extrasMinor;
    const taxMinor = quote.taxMinor + extrasTaxMinor;
    const totalMinor = subtotalMinor + taxMinor;

    // Snapshot the cancellation terms in force right now, exactly like the priced lines above:
    // a later Configuration → Policy change applies to new bookings, never re-prices this one
    // (FR-PAY-006 — the refund is computed from the preserved booking terms).
    const cancelPolicy = {
      freeCancelHours: await this.config.policy('cancellation', 'freeCancelHours'),
      lateFeeBps: await this.config.policy('cancellation', 'lateFeeBps'),
    };

    // ---- authorize + capture (idempotent on the reservation reference) ----
    const pay = await this.payments.authorizeAndCapture({
      organizationId: orgId,
      reservationReference: reference,
      purpose: 'booking',
      amountMinor: totalMinor,
      currency: quote.currency,
      token: input.paymentToken,
      actor: input.actor,
    });

    // ---- fault injection: money moved but the write fails → owned recovery case ----
    if (input.simulateWriteFailure) {
      await this.payments.openCase({
        organizationId: orgId,
        kind: 'write_after_charge',
        subjectType: 'reservation',
        subjectRef: reference,
        summary: `Payment captured for ${reference} but the reservation write failed`,
        detail: { intentId: pay.intentId, amountMinor: totalMinor },
      });
      throw new AppError('internal_error', {
        title: 'We took your payment but could not finish the booking — our team has been alerted',
        params: { reason: 'write_after_charge', caseOpened: true },
      });
    }

    // ---- persist the reservation atomically ----
    const guestToken = input.actor ? null : randomBytes(24).toString('base64url');
    let created;
    try {
      created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(reservation)
          .values({
            organizationId: orgId,
            reference,
            state: 'confirmed',
            accountId: input.actor?.accountId ?? null,
            holderKey: input.holderKey ?? null,
            accessTokenHash: guestToken ? sha256(guestToken) : null,
            categoryCode: quote.categoryCode,
            pickupLocationCode: quote.pickupLocationCode,
            returnLocationCode: quote.returnLocationCode,
            pickupAt: quote.pickupAt,
            returnAt: quote.returnAt,
            durationHours: quote.durationHours,
            quoteReference: input.quoteReference,
            quoteVersion: quote.version,
            holdId: quote.holdId ?? null,
            currency: quote.currency,
            subtotalMinor,
            taxMinor,
            totalMinor,
            paidMinor: totalMinor,
            channel: input.actor?.kind === 'staff' ? 'staff' : input.actor ? 'customer' : 'guest',
            confirmedAt: sql`now()`,
            cancelPolicy,
            createdBy: input.actor?.accountId ?? null,
          })
          .returning();
        const reservationId = row!.id;

        // lines: quote snapshot (non-tax) + priced extras + tax last
        let sort = 0;
        const lineRows = [
          ...quote.lines
            .filter((l) => l.kind !== 'tax')
            .map((l) => ({
              reservationId,
              kind: l.kind,
              code: l.code,
              label: l.label,
              quantity: l.quantity,
              unitMinor: l.unitMinor,
              amountMinor: l.amountMinor,
              sortOrder: sort++,
            })),
          ...extras.map((e) => ({
            reservationId,
            kind: 'extra' as const,
            code: e.code,
            label: e.label,
            quantity: e.quantity,
            unitMinor: e.unitMinor,
            amountMinor: e.amountMinor,
            sortOrder: sort++,
          })),
          {
            reservationId,
            kind: 'tax' as const,
            code: 'tax',
            label: 'Tax',
            quantity: 1,
            unitMinor: taxMinor,
            amountMinor: taxMinor,
            sortOrder: sort++,
          },
        ];
        await tx.insert(reservationLine).values(lineRows);

        await tx.insert(reservationDriver).values(
          input.drivers.map((d) => ({
            reservationId,
            role: d.role ?? 'primary_renter',
            savedDriverId: d.savedDriverId ?? null,
            fullName: d.fullName,
            dateOfBirth: d.dateOfBirth ?? null,
            email: d.email ?? null,
            phone: d.phone ?? null,
            licenceNumber: d.licenceNumber ?? null,
            licenceCountry: d.licenceCountry ?? null,
            licenceExpiresOn: d.licenceExpiresOn ?? null,
            createdBy: input.actor?.accountId ?? null,
          })),
        );

        await tx.insert(consentSnapshot).values({
          reservationId,
          kind: 'rental_terms',
          documentVersion: TERMS_VERSION,
          actorType: input.actor?.kind ?? 'guest',
          actorId: input.actor?.accountId ?? null,
          ipHash: input.ipHash ?? null,
        });

        if (quote.holdId) {
          await tx
            .update(hold)
            .set({
              status: 'consumed',
              releasedAt: sql`now()`,
              releaseReason: 'confirmed',
              updatedAt: sql`now()`,
            })
            .where(eq(hold.id, quote.holdId));
        }

        await this.outbox.emit(
          {
            type: 'reservation.confirmed.v1',
            aggregateType: 'reservation',
            aggregateId: reservationId,
            payload: { reference, totalMinor, categoryCode: quote.categoryCode },
          },
          tx,
        );
        return row!;
      });
    } catch (err) {
      // a concurrent confirm won the race and inserted this reference first — return theirs.
      // The payment idempotency key is the same, so no second charge was made.
      if (isUniqueViolation(err)) {
        return this.getReservation(reference, input.actor);
      }
      throw err;
    }

    await this.audit.record({
      action: 'booking.reservation.confirmed',
      targetType: 'reservation',
      targetId: created.id,
      actor: input.actor ?? undefined,
      after: { reference, totalMinor, paymentIntentId: pay.intentId },
    });

    // notification failure must NOT fail the confirmation (TEST-ERR-005)
    try {
      const to = input.drivers.find(
        (d) => (d.role ?? 'primary_renter') === 'primary_renter',
      )?.email;
      // FR-ADM-011 audience — resolve every audience the event rule could be configured for, so
      // whichever one is actually selected has a real recipient instead of always going to the
      // primary renter regardless of what ops configured.
      let accountEmail: string | undefined;
      if (input.actor?.kind === 'customer') {
        const [acc] = await this.db
          .select({ email: account.email })
          .from(account)
          .where(eq(account.id, input.actor.accountId))
          .limit(1);
        accountEmail = acc?.email;
      }
      const [pickupLocation] = await this.db
        .select({ contact: location.contact })
        .from(location)
        .where(eq(location.code, quote.pickupLocationCode))
        .limit(1);
      const opsEmail = pickupLocation?.contact?.email;
      const allDrivers = input.drivers
        .filter((d): d is typeof d & { email: string } => !!d.email)
        .map((d) => ({ email: d.email }));

      await this.notify.send({
        event: 'reservation_confirmed',
        channel: 'email',
        // the accountId fallback here was never a real email — an unresolvable primary-renter
        // address now falls back to the booking account's own email, not its UUID.
        recipient: to ?? accountEmail ?? 'unknown',
        recipientRef: input.actor?.accountId,
        audience: {
          primary_renter: to ? { email: to } : undefined,
          account_holder: accountEmail
            ? { email: accountEmail, ref: input.actor?.accountId }
            : undefined,
          all_drivers: allDrivers.length ? allDrivers : undefined,
          ops: opsEmail ? { email: opsEmail } : undefined,
        },
        localeCode: input.actor?.localeCode ?? 'en',
        sourceType: 'reservation',
        sourceId: reference,
        variables: { reference, total: `${(totalMinor / 100).toFixed(2)} ${quote.currency}` },
        fallback: {
          subject: `Your booking ${reference} is confirmed`,
          body: `Booking ${reference} is confirmed. Total charged: ${(totalMinor / 100).toFixed(2)} ${quote.currency}.`,
        },
      });
    } catch (err) {
      this.logger.warn(`confirmation email failed for ${reference}: ${(err as Error).message}`);
    }

    return {
      ...(await this.getReservation(reference, input.actor)),
      guestAccessToken: guestToken,
      payment: { brand: pay.brand, last4: pay.last4, alreadyProcessed: pay.alreadyProcessed },
      heldUnitPinned,
    };
  }

  async getReservation(reference: string, actor: Actor | null) {
    const [row] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reference))
      .limit(1);
    if (!row) throw AppError.notFound('reservation');
    // ownership: the owner, staff, or a guest presenting the token (checked by the controller)
    if (actor && actor.kind !== 'staff' && row.accountId && row.accountId !== actor.accountId) {
      throw AppError.forbidden('This reservation belongs to another account');
    }
    const lines = await this.db
      .select()
      .from(reservationLine)
      .where(eq(reservationLine.reservationId, row.id))
      .orderBy(asc(reservationLine.sortOrder));
    const drivers = await this.db
      .select()
      .from(reservationDriver)
      .where(eq(reservationDriver.reservationId, row.id));
    const [consent] = await this.db
      .select()
      .from(consentSnapshot)
      .where(
        and(eq(consentSnapshot.reservationId, row.id), eq(consentSnapshot.kind, 'rental_terms')),
      )
      .limit(1);

    return {
      reference: row.reference,
      state: row.state,
      categoryCode: row.categoryCode,
      pickupLocationCode: row.pickupLocationCode,
      returnLocationCode: row.returnLocationCode,
      pickupAt: new Date(row.pickupAt).toISOString(),
      returnAt: new Date(row.returnAt).toISOString(),
      durationHours: row.durationHours,
      currency: row.currency,
      subtotalMinor: row.subtotalMinor,
      taxMinor: row.taxMinor,
      totalMinor: row.totalMinor,
      paidMinor: row.paidMinor,
      channel: row.channel,
      confirmedAt: row.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
      lines: lines.map((l) => ({
        kind: l.kind,
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
      })),
      drivers: drivers.map((d) => ({
        role: d.role,
        fullName: d.fullName,
        licenceNumber: d.licenceNumber,
        email: d.email,
      })),
      termsAccepted: consent
        ? {
            version: consent.documentVersion,
            acceptedAt: new Date(consent.acceptedAt).toISOString(),
          }
        : null,
    };
  }

  async listForActor(actor: Actor) {
    const rows = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.accountId, actor.accountId))
      .orderBy(sql`${reservation.createdAt} desc`)
      .limit(50);
    return rows.map((r) => ({
      reference: r.reference,
      state: r.state,
      categoryCode: r.categoryCode,
      pickupLocationCode: r.pickupLocationCode,
      pickupAt: new Date(r.pickupAt).toISOString(),
      returnAt: new Date(r.returnAt).toISOString(),
      totalMinor: r.totalMinor,
      currency: r.currency,
    }));
  }

  /** Attach a guest reservation (created without an account) to the account presenting the token. */
  async claimGuest(actor: Actor, reference: string, token: string) {
    const [row] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reference))
      .limit(1);
    if (!row || !row.accessTokenHash || row.accessTokenHash !== sha256(token)) {
      throw AppError.notFound('reservation');
    }
    if (row.accountId) {
      return this.getReservation(reference, actor);
    }
    await this.db
      .update(reservation)
      .set({ accountId: actor.accountId, channel: 'customer', updatedAt: sql`now()` })
      .where(eq(reservation.id, row.id));
    await this.audit.record({
      action: 'booking.reservation.claimed',
      targetType: 'reservation',
      targetId: row.id,
      actor,
    });
    return this.getReservation(reference, actor);
  }

  verifyGuestToken(reference: string, token: string): Promise<boolean> {
    return this.db
      .select({ h: reservation.accessTokenHash })
      .from(reservation)
      .where(eq(reservation.reference, reference))
      .limit(1)
      .then(([r]) => !!r?.h && r.h === sha256(token));
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
