import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleUnit } from '../../database/schema/fleet';
import { invoice, invoiceCounter } from '../../database/schema/invoice';
import { organization } from '../../database/schema/org';
import { reservation, reservationDriver, reservationLine } from '../../database/schema/reservation';

export interface InvoiceView {
  number: string;
  docVersion: number;
  kind: 'invoice' | 'credit_note';
  previousNumber: string | null;
  reservationReference: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string | null;
  issuedAt: string;
  snapshot: Record<string, unknown>;
}

/**
 * FR-PAY invoices — formal, immutable billing documents distinct from the lightweight printable
 * "receipt" on the customer site. Each `invoice` row is issued once and never edited; a later
 * refund or cancellation issues a `credit_note` row referencing it rather than mutating it, so the
 * original remains the permanent record of what was originally charged. Issuance is best-effort
 * and must never block the booking/refund flow that triggers it — every public method here either
 * returns null or throws only `AppError`s that its callers already swallow.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** Atomically assigns the next gapless number for the org, inside the caller's transaction. */
  private async nextNumber(tx: Database, organizationId: string): Promise<string> {
    const [row] = await tx
      .insert(invoiceCounter)
      .values({ organizationId, nextNumber: 2 })
      .onConflictDoUpdate({
        target: invoiceCounter.organizationId,
        set: { nextNumber: sql`${invoiceCounter.nextNumber} + 1` },
      })
      .returning({ nextNumber: invoiceCounter.nextNumber });
    const assigned = row!.nextNumber - 1;
    return `INV-${String(assigned).padStart(6, '0')}`;
  }

  /**
   * Called once, right after a reservation is confirmed. Silently skips (logs a warning) rather
   * than throwing when the organization's legal profile isn't filled in yet, or the reservation
   * can't be found — a missing invoice is recoverable (an admin can fill in the profile and this
   * can be re-run later); blocking the booking itself over it would not be.
   */
  async issueInvoice(reservationReference: string): Promise<InvoiceView | null> {
    const orgId = await this.orgId();
    const [org] = await this.db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    if (!org?.legalName || !org.taxId || !org.registeredAddress) {
      this.logger.warn(
        `skipped invoice for ${reservationReference}: organization legal profile is incomplete`,
      );
      return null;
    }

    const [res] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reservationReference))
      .limit(1);
    if (!res) {
      this.logger.warn(`skipped invoice for ${reservationReference}: reservation not found`);
      return null;
    }

    const [lines, [primaryDriver], [pickedUnit]] = await Promise.all([
      this.db
        .select()
        .from(reservationLine)
        .where(eq(reservationLine.reservationId, res.id))
        .orderBy(asc(reservationLine.sortOrder)),
      this.db
        .select()
        .from(reservationDriver)
        .where(
          and(
            eq(reservationDriver.reservationId, res.id),
            eq(reservationDriver.role, 'primary_renter'),
          ),
        )
        .limit(1),
      res.unitId
        ? this.db
            .select({
              make: vehicleUnit.make,
              model: vehicleUnit.model,
              colour: vehicleUnit.colour,
            })
            .from(vehicleUnit)
            .where(eq(vehicleUnit.id, res.unitId))
            .limit(1)
        : Promise.resolve([]),
    ]);

    const snapshot = {
      org: {
        tradingName: org.name,
        legalName: org.legalName,
        taxId: org.taxId,
        registeredAddress: org.registeredAddress,
      },
      customer: { fullName: primaryDriver?.fullName ?? null, email: primaryDriver?.email ?? null },
      trip: {
        categoryCode: res.categoryCode,
        pickupLocationCode: res.pickupLocationCode,
        returnLocationCode: res.returnLocationCode,
        pickupAt: res.pickupAt,
        returnAt: res.returnAt,
        pickedUnit: pickedUnit ?? null,
      },
      lines: lines.map((l) => ({
        kind: l.kind,
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
      })),
    };

    return this.db.transaction(async (tx) => {
      const number = await this.nextNumber(tx, orgId);
      const [row] = await tx
        .insert(invoice)
        .values({
          organizationId: orgId,
          reservationReference,
          number,
          docVersion: 1,
          previousInvoiceId: null,
          kind: 'invoice',
          currency: res.currency,
          subtotalMinor: res.subtotalMinor,
          taxMinor: res.taxMinor,
          totalMinor: res.totalMinor,
          reason: null,
          snapshot,
          issuedAt: sql`now()`,
        })
        .returning();
      return this.toView(row!, null);
    });
  }

  /**
   * Called after a refund or cancellation completes. Finds the latest document issued for this
   * reservation and, if one exists, issues a credit note against it for the refunded amount.
   * Silently skips if no invoice was ever issued for this reservation (e.g. the org's legal
   * profile was still incomplete when it was confirmed) — there is nothing to correct.
   */
  async issueCreditNote(
    reservationReference: string,
    amountMinor: number,
    reason: string,
  ): Promise<InvoiceView | null> {
    if (amountMinor <= 0) return null;
    const orgId = await this.orgId();
    const [latest] = await this.db
      .select()
      .from(invoice)
      .where(
        and(
          eq(invoice.organizationId, orgId),
          eq(invoice.reservationReference, reservationReference),
        ),
      )
      .orderBy(desc(invoice.docVersion))
      .limit(1);
    if (!latest) {
      this.logger.warn(
        `skipped credit note for ${reservationReference}: no invoice was ever issued for it`,
      );
      return null;
    }

    const snapshot = {
      ...(latest.snapshot as Record<string, unknown>),
      lines: [
        {
          kind: 'credit',
          code: 'refund',
          label: reason,
          quantity: 1,
          unitMinor: -amountMinor,
          amountMinor: -amountMinor,
        },
      ],
    };

    return this.db.transaction(async (tx) => {
      const number = await this.nextNumber(tx, orgId);
      const [row] = await tx
        .insert(invoice)
        .values({
          organizationId: orgId,
          reservationReference,
          number,
          docVersion: latest.docVersion + 1,
          previousInvoiceId: latest.id,
          kind: 'credit_note',
          currency: latest.currency,
          subtotalMinor: -amountMinor,
          taxMinor: 0,
          totalMinor: -amountMinor,
          reason,
          snapshot,
          issuedAt: sql`now()`,
        })
        .returning();
      return this.toView(row!, latest.number);
    });
  }

  async listForReservation(reservationReference: string): Promise<InvoiceView[]> {
    const rows = await this.db
      .select()
      .from(invoice)
      .where(eq(invoice.reservationReference, reservationReference))
      .orderBy(asc(invoice.docVersion));
    const byId = new Map(rows.map((r) => [r.id, r.number]));
    return rows.map((r) =>
      this.toView(r, r.previousInvoiceId ? (byId.get(r.previousInvoiceId) ?? null) : null),
    );
  }

  async getByNumber(number: string): Promise<InvoiceView> {
    const orgId = await this.orgId();
    const [row] = await this.db
      .select()
      .from(invoice)
      .where(and(eq(invoice.organizationId, orgId), eq(invoice.number, number)))
      .limit(1);
    if (!row) throw AppError.notFound('invoice');
    let previousNumber: string | null = null;
    if (row.previousInvoiceId) {
      const [prev] = await this.db
        .select({ number: invoice.number })
        .from(invoice)
        .where(eq(invoice.id, row.previousInvoiceId))
        .limit(1);
      previousNumber = prev?.number ?? null;
    }
    return this.toView(row, previousNumber);
  }

  private toView(row: typeof invoice.$inferSelect, previousNumber: string | null): InvoiceView {
    return {
      number: row.number,
      docVersion: row.docVersion,
      kind: row.kind as 'invoice' | 'credit_note',
      previousNumber,
      reservationReference: row.reservationReference,
      currency: row.currency,
      subtotalMinor: row.subtotalMinor,
      taxMinor: row.taxMinor,
      totalMinor: row.totalMinor,
      reason: row.reason,
      issuedAt: new Date(row.issuedAt).toISOString(),
      snapshot: row.snapshot,
    };
  }
}
