import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, inArray, notInArray, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { maskEmail } from '../../common/mask';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer, driver, driverDocument, privacyRequest } from '../../database/schema/customer';
import { account, authChallenge, session } from '../../database/schema/iam';
import { invoice } from '../../database/schema/invoice';
import { notification } from '../../database/schema/notify';
import { paymentIntent, recoveryCase } from '../../database/schema/payment';
import { storedObject } from '../../database/schema/platform';
import { rental } from '../../database/schema/rental';
import {
  consentSnapshot,
  reconciliationException,
  reservation,
  reservationDriver,
  reservationLine,
} from '../../database/schema/reservation';
import { NotifyPublic } from '../notify/notify.public';
import { PaymentPublic } from '../payment/payment.public';

type Kind = 'access' | 'correction' | 'closure';
type RequestRow = typeof privacyRequest.$inferSelect;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export interface Blocker {
  code: 'open_reservations' | 'open_rentals' | 'open_payment_issues';
  /** English, for logs and staff; customers see a translated line chosen by `code` */
  detail: string;
  count: number;
}

const DAY_MS = 86_400_000;
/** GDPR Art. 12(3): a data-subject request is answered within one month */
const RESPONSE_DAYS = 30;
/** how long a completed access request's download stays available */
const EXPORT_DAYS = 30;
/** a request still being worked on */
const OPEN = ['received', 'in_review', 'blocked'] as const;
const OPEN_SQL = sql`('received','in_review','blocked')`;

const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null);

/**
 * Account data access, correction and closure (FR-IAM-008, DEC-041).
 *
 * A customer files a request from their account; staff (`customer.manage`) work it from the
 * privacy queue; the customer sees the outcome. Until DEC-041 requests were only recorded — a
 * closure was always "blocked" by a placeholder and nothing ever completed, exported or erased.
 *
 *  - **access** — completing it releases a download of the person's data (built when they
 *    download it, so it is current, and never stored as a second copy).
 *  - **correction** — completed with a note of what was corrected (the person can edit their own
 *    profile and drivers themselves; this is for what they cannot).
 *  - **closure** — blocked while there is open activity (a current or upcoming reservation or
 *    rental, an unresolved payment issue). Otherwise it closes the account and erases the
 *    personal data held about the person, KEEPING the transaction records the business must
 *    retain (reservations, rentals, invoices, payments — and the audit trail).
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger('PrivacyService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly payments: PaymentPublic,
    private readonly notify: NotifyPublic,
    private readonly storage: ObjectStorageService,
  ) {}

  // ---------------------------------------------------------------- what a request looks like

  private present(r: RequestRow) {
    const created = new Date(r.createdAt);
    const resolved = r.resolvedAt ? new Date(r.resolvedAt) : null;
    return {
      id: r.id,
      kind: r.kind as Kind,
      status: r.status,
      blockers: r.blockers,
      detail: r.detail,
      resolutionNote: r.resolutionNote,
      resolvedAt: resolved?.toISOString() ?? null,
      createdAt: created.toISOString(),
      /** the day a reply is due */
      dueAt: new Date(created.getTime() + RESPONSE_DAYS * DAY_MS).toISOString(),
      exportReady:
        r.kind === 'access' &&
        r.status === 'completed' &&
        !!resolved &&
        Date.now() < resolved.getTime() + EXPORT_DAYS * DAY_MS,
    };
  }

  private isOpen(status: string): boolean {
    return (OPEN as readonly string[]).includes(status);
  }

  private async load(id: string): Promise<RequestRow> {
    const [row] = await this.db
      .select()
      .from(privacyRequest)
      .where(eq(privacyRequest.id, id))
      .limit(1);
    if (!row) throw AppError.notFound('request');
    return row;
  }

  // ---------------------------------------------------------------- closure blockers

  /**
   * What stops an account being closed right now. The list is recomputed whenever it is looked at:
   * a request that was blocked yesterday because of a trip that has since ended is not blocked today.
   * Retention of past transaction records is NOT a blocker — those are kept, not waited for.
   */
  async closureBlockers(accountId: string): Promise<Blocker[]> {
    const mine = this.db
      .select({ ref: reservation.reference })
      .from(reservation)
      .where(eq(reservation.accountId, accountId));
    const count = async (q: PromiseLike<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;

    const openReservations = await count(
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(reservation)
        .where(
          and(
            eq(reservation.accountId, accountId),
            inArray(reservation.state, ['pending', 'confirmed']),
            gt(reservation.returnAt, new Date().toISOString()),
          ),
        ),
    );
    const openRentals = await count(
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(rental)
        .innerJoin(reservation, eq(reservation.reference, rental.reservationReference))
        .where(
          and(
            eq(reservation.accountId, accountId),
            notInArray(rental.state, ['closed', 'cancelled']),
          ),
        ),
    );
    const openExceptions = await count(
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(reconciliationException)
        .where(
          and(
            eq(reconciliationException.state, 'open'),
            inArray(reconciliationException.reservationReference, mine),
          ),
        ),
    );
    const openCases = await count(
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(recoveryCase)
        .where(
          and(sql`${recoveryCase.state} <> 'resolved'`, inArray(recoveryCase.subjectRef, mine)),
        ),
    );

    const blockers: Blocker[] = [];
    if (openReservations)
      blockers.push({
        code: 'open_reservations',
        count: openReservations,
        detail: `${openReservations} current or upcoming reservation(s) must be completed or cancelled first`,
      });
    if (openRentals)
      blockers.push({
        code: 'open_rentals',
        count: openRentals,
        detail: `${openRentals} rental(s) are still open`,
      });
    if (openExceptions + openCases)
      blockers.push({
        code: 'open_payment_issues',
        count: openExceptions + openCases,
        detail: `${openExceptions + openCases} payment issue(s) are still being resolved`,
      });
    return blockers;
  }

  /** A closure request that is still waiting reflects what blocks it NOW (and unblocks itself). */
  private async refresh(row: RequestRow): Promise<RequestRow> {
    if (row.kind !== 'closure' || !['received', 'blocked'].includes(row.status)) return row;
    const blockers = await this.closureBlockers(row.accountId);
    const status = blockers.length ? 'blocked' : 'received';
    if (status === row.status && JSON.stringify(blockers) === JSON.stringify(row.blockers))
      return row;
    const [updated] = await this.db
      .update(privacyRequest)
      .set({ status, blockers, updatedAt: sql`now()` })
      .where(
        and(eq(privacyRequest.id, row.id), inArray(privacyRequest.status, ['received', 'blocked'])),
      )
      .returning();
    return updated ?? row;
  }

  // ---------------------------------------------------------------- the customer's side

  async listMine(actor: Actor) {
    const rows = await this.db
      .select()
      .from(privacyRequest)
      .where(eq(privacyRequest.accountId, actor.accountId))
      .orderBy(desc(privacyRequest.createdAt));
    return Promise.all(rows.map(async (r) => this.present(await this.refresh(r))));
  }

  async create(actor: Actor, kind: Kind, detail?: string) {
    // a request of this kind that is already being worked on IS that request, not a second one
    const [existing] = await this.db
      .select()
      .from(privacyRequest)
      .where(
        and(
          eq(privacyRequest.accountId, actor.accountId),
          eq(privacyRequest.kind, kind),
          inArray(privacyRequest.status, [...OPEN]),
        ),
      )
      .limit(1);
    if (existing) return this.present(await this.refresh(existing));

    const blockers = kind === 'closure' ? await this.closureBlockers(actor.accountId) : [];
    const [cust] = await this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, actor.accountId))
      .limit(1);
    const [row] = await this.db
      .insert(privacyRequest)
      .values({
        accountId: actor.accountId,
        customerId: cust?.id ?? null,
        kind,
        detail: detail ?? null,
        status: blockers.length ? 'blocked' : 'received',
        blockers,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: `iam.data_request.${kind}`,
      targetType: 'privacy_request',
      targetId: row!.id,
      actor,
      after: { kind, status: row!.status },
    });
    return this.present(row!);
  }

  async cancel(actor: Actor, id: string) {
    const [row] = await this.db
      .select()
      .from(privacyRequest)
      .where(and(eq(privacyRequest.id, id), eq(privacyRequest.accountId, actor.accountId)))
      .limit(1);
    if (!row) throw AppError.notFound('request');
    if (!this.isOpen(row.status)) {
      throw new AppError('business_rule_violation', { title: 'This request is already finalised' });
    }
    const [updated] = await this.db
      .update(privacyRequest)
      .set({ status: 'cancelled', updatedAt: sql`now()` })
      .where(and(eq(privacyRequest.id, id), inArray(privacyRequest.status, [...OPEN])))
      .returning();
    if (!updated) {
      throw new AppError('state_conflict', {
        title: 'This request was just handled — refresh to see it',
      });
    }
    await this.audit.record({
      action: 'iam.data_request.cancelled',
      targetType: 'privacy_request',
      targetId: id,
      actor,
    });
    return this.present(updated);
  }

  /** The person's data, for a completed access request. Built now (so it is current) and never stored. */
  async exportFor(actor: Actor, id: string) {
    const [row] = await this.db
      .select()
      .from(privacyRequest)
      .where(
        and(
          eq(privacyRequest.id, id),
          eq(privacyRequest.accountId, actor.accountId),
          eq(privacyRequest.kind, 'access'),
        ),
      )
      .limit(1);
    if (!row) throw AppError.notFound('request');
    if (!this.present(row).exportReady) {
      throw AppError.businessRule('This export is not available', {
        reason: row.status === 'completed' ? 'export_expired' : 'not_ready',
      });
    }
    const data = await this.buildExport(actor.accountId);
    await this.audit.record({
      action: 'iam.data_request.export_downloaded',
      targetType: 'privacy_request',
      targetId: id,
      actor,
    });
    return { filename: `my-data-${new Date().toISOString().slice(0, 10)}.json`, data };
  }

  // ---------------------------------------------------------------- staff: the queue

  async opsList(q: { status?: string; kind?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    // `open` = still being worked on; `done` = finished (completed, rejected or withdrawn)
    const where = and(
      q.status === 'open'
        ? inArray(privacyRequest.status, [...OPEN])
        : q.status === 'done'
          ? notInArray(privacyRequest.status, [...OPEN])
          : q.status
            ? eq(privacyRequest.status, q.status)
            : undefined,
      q.kind ? eq(privacyRequest.kind, q.kind) : undefined,
    );
    const [{ n: total } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(privacyRequest)
      .where(where);
    const rows = await this.db
      .select({ r: privacyRequest, name: account.displayName, email: account.email })
      .from(privacyRequest)
      .innerJoin(account, eq(account.id, privacyRequest.accountId))
      .where(where)
      // what is still open first — the one nearest its deadline on top — then the finished, newest first
      .orderBy(
        sql`(${privacyRequest.status} in ${OPEN_SQL}) desc`,
        sql`case when ${privacyRequest.status} in ${OPEN_SQL} then ${privacyRequest.createdAt} end asc`,
        sql`${privacyRequest.resolvedAt} desc nulls last`,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const items = await Promise.all(
      rows.map(async ({ r, name, email }) =>
        this.presentForStaff(await this.refresh(r), name, email),
      ),
    );
    return { items, total, page, pageSize };
  }

  private presentForStaff(r: RequestRow, name: string, email: string) {
    const p = this.present(r);
    return {
      ...p,
      overdue: this.isOpen(r.status) && Date.now() > new Date(p.dueAt).getTime(),
      customer: { accountId: r.accountId, name, email: maskEmail(email) },
    };
  }

  async opsDetail(id: string) {
    const row = await this.refresh(await this.load(id));
    const [acc] = await this.db
      .select()
      .from(account)
      .where(eq(account.id, row.accountId))
      .limit(1);
    return {
      ...this.presentForStaff(row, acc?.displayName ?? '—', acc?.email ?? ''),
      // for an access request: what the download will contain, so the reviewer can see it is not empty
      exportSummary:
        row.kind === 'access' ? this.summarise(await this.buildExport(row.accountId)) : null,
    };
  }

  /** Staff start working a request. */
  async review(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.status === 'in_review') return this.presentForStaff(row, ...(await this.who(row)));
    const [updated] = await this.db
      .update(privacyRequest)
      .set({ status: 'in_review', updatedBy: actor.accountId, updatedAt: sql`now()` })
      .where(
        and(eq(privacyRequest.id, id), inArray(privacyRequest.status, ['received', 'blocked'])),
      )
      .returning();
    if (!updated) throw this.alreadyHandled(row);
    await this.audit.record({
      action: `iam.data_request.${row.kind}.review`,
      targetType: 'privacy_request',
      targetId: id,
      actor,
    });
    return this.presentForStaff(updated, ...(await this.who(updated)));
  }

  async reject(actor: Actor, id: string, note: string) {
    const row = await this.load(id);
    const [updated] = await this.db
      .update(privacyRequest)
      .set({
        status: 'rejected',
        resolutionNote: note,
        resolvedBy: actor.accountId,
        resolvedAt: sql`now()`,
        updatedBy: actor.accountId,
        updatedAt: sql`now()`,
      })
      .where(and(eq(privacyRequest.id, id), inArray(privacyRequest.status, [...OPEN])))
      .returning();
    if (!updated) throw this.alreadyHandled(row);
    await this.audit.record({
      action: `iam.data_request.${row.kind}.rejected`,
      targetType: 'privacy_request',
      targetId: id,
      actor,
      reason: note,
    });
    await this.tell(updated, 'rejected', note);
    return this.presentForStaff(updated, ...(await this.who(updated)));
  }

  /**
   * Finish a request. Access: release the download. Correction: record what was corrected.
   * Closure: close the account and erase (see {@link executeClosure}).
   */
  async complete(actor: Actor, id: string, note?: string) {
    const row = await this.refresh(await this.load(id));
    if (!this.isOpen(row.status)) throw this.alreadyHandled(row);

    if (row.kind === 'correction' && !note?.trim()) {
      throw AppError.validation([{ path: 'note', code: 'too_small' }], 'Say what was corrected');
    }
    if (row.kind === 'closure') return this.executeClosure(actor, row, note?.trim() || null);

    const [updated] = await this.db
      .update(privacyRequest)
      .set({
        status: 'completed',
        resolutionNote: note?.trim() || null,
        resolvedBy: actor.accountId,
        resolvedAt: sql`now()`,
        updatedBy: actor.accountId,
        updatedAt: sql`now()`,
      })
      .where(and(eq(privacyRequest.id, id), inArray(privacyRequest.status, [...OPEN])))
      .returning();
    if (!updated) throw this.alreadyHandled(row);
    await this.audit.record({
      action: `iam.data_request.${row.kind}.completed`,
      targetType: 'privacy_request',
      targetId: id,
      actor,
    });
    await this.tell(updated, 'completed', updated.resolutionNote);
    return this.presentForStaff(updated, ...(await this.who(updated)));
  }

  private alreadyHandled(row: RequestRow): AppError {
    return new AppError('state_conflict', {
      title: 'This request has already been handled',
      currentState: row.status,
    });
  }

  private async who(row: RequestRow): Promise<[string, string]> {
    const [acc] = await this.db
      .select({ name: account.displayName, email: account.email })
      .from(account)
      .where(eq(account.id, row.accountId))
      .limit(1);
    return [acc?.name ?? '—', acc?.email ?? ''];
  }

  // ---------------------------------------------------------------- closure: erase

  /**
   * Close the account and erase what identifies the person, in one transaction — except what must
   * be kept. Order matters:
   *  1. Open activity blocks it (and the request says so).
   *  2. The payment processor is asked to drop the saved cards FIRST: if it cannot, nothing has
   *     been changed and staff simply try again — never a closed account with a card left behind.
   *  3. One transaction: the login is retired (sessions revoked, password and contact removed), the
   *     customer profile, saved drivers and their documents are erased, and messages sent to the
   *     person are redacted.
   *  4. Only afterwards: the document files are deleted and the person is told.
   *
   * KEPT, on purpose: reservations, rentals, invoices and payments (financial and contractual
   * records the business must retain), the per-reservation driver details on them, and the audit
   * trail. Erasing those is a separate, scheduled retention decision — not something one request does.
   */
  private async executeClosure(actor: Actor, row: RequestRow, note: string | null) {
    const blockers = await this.closureBlockers(row.accountId);
    if (blockers.length) {
      await this.db
        .update(privacyRequest)
        .set({ status: 'blocked', blockers, updatedAt: sql`now()` })
        .where(and(eq(privacyRequest.id, row.id), inArray(privacyRequest.status, [...OPEN])));
      throw AppError.businessRule(
        'This account still has open activity, so it cannot be closed yet',
        {
          reason: 'closure_blocked',
          blockers: blockers.map((b) => b.code).join(','),
        },
      );
    }

    const cards = await this.payments.forgetSavedCards(row.accountId);
    if (cards.failed.length) {
      throw new AppError('dependency_unavailable', {
        title:
          'The payment provider could not remove the saved cards, so nothing was changed — try again shortly',
        params: { reason: 'saved_cards_not_removed' },
      });
    }

    const done = await this.db.transaction(async (tx) => {
      // two staff completing the same request must not both erase
      const [locked] = await tx
        .select()
        .from(privacyRequest)
        .where(eq(privacyRequest.id, row.id))
        .for('update');
      if (!locked || !this.isOpen(locked.status)) throw this.alreadyHandled(locked ?? row);

      const closed = await this.closeAccountRow(tx, row.accountId);
      if (!closed) {
        throw AppError.businessRule('Only a customer account can be closed here', {
          reason: 'not_a_customer',
        });
      }
      const erased = await this.eraseProfile(tx, row.accountId, closed.email);

      const summary =
        `Account closed. Erased: sign-in and contact details, profile, ${erased.drivers} saved driver(s), ` +
        `${erased.documents} document(s), ${erased.messages} message(s). ` +
        `Kept for the legal retention period: reservations, rentals, invoices and payments.` +
        (note ? ` ${note}` : '');
      const [updated] = await tx
        .update(privacyRequest)
        .set({
          status: 'completed',
          blockers: [],
          resolutionNote: summary,
          resolvedBy: actor.accountId,
          resolvedAt: sql`now()`,
          updatedBy: actor.accountId,
          updatedAt: sql`now()`,
        })
        .where(eq(privacyRequest.id, row.id))
        .returning();
      return { updated: updated!, closed, objectKeys: erased.objectKeys };
    });

    for (const key of done.objectKeys) {
      await this.storage
        .remove(key)
        .catch((err) =>
          this.logger.warn(
            { key, err },
            'a driver document file could not be removed — remove it by hand',
          ),
        );
    }
    await this.audit.record({
      action: 'iam.data_request.closure.completed',
      targetType: 'privacy_request',
      targetId: row.id,
      actor,
      after: { accountClosed: true, documentFilesRemoved: done.objectKeys.length },
    });
    // the person can no longer sign in to see the outcome — tell the address the account had (only
    // the staff member's own words go in: the erasure summary above is for staff, in English)
    await this.tell(done.updated, 'closed', note, done.closed);
    return this.presentForStaff(done.updated, done.closed.name, done.closed.email);
  }

  /** Retire the login. The row stays — reservations, invoices and the audit trail point at it. */
  private async closeAccountRow(tx: Tx, accountId: string) {
    const [acc] = await tx.select().from(account).where(eq(account.id, accountId)).limit(1);
    if (!acc || acc.kind !== 'customer') return null;
    const placeholder = `closed-${acc.id}@closed.invalid`;
    await tx
      .update(account)
      .set({
        email: placeholder,
        emailNormalized: placeholder,
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
        passwordHash: null,
        passwordAlgo: null,
        displayName: 'Closed account',
        status: 'closed',
        failedLoginCount: 0,
        lockedUntil: null,
        version: sql`${account.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(account.id, acc.id));
    await tx
      .update(session)
      .set({
        revokedAt: sql`coalesce(${session.revokedAt}, now())`,
        revokedReason: sql`coalesce(${session.revokedReason}, 'account_closed')`,
        ip: null,
        userAgent: null,
      })
      .where(eq(session.accountId, acc.id));
    await tx.delete(authChallenge).where(eq(authChallenge.accountId, acc.id));
    return { email: acc.email, name: acc.displayName, locale: acc.localeCode };
  }

  private async eraseProfile(tx: Tx, accountId: string, oldEmail: string) {
    const [cust] = await tx
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.accountId, accountId))
      .limit(1);
    let drivers = 0;
    let documents = 0;
    const objectKeys: string[] = [];
    if (cust) {
      const docs = await tx
        .select({ id: driverDocument.id, objectId: driverDocument.objectId })
        .from(driverDocument)
        .where(eq(driverDocument.customerId, cust.id));
      const objectIds = docs.map((d) => d.objectId).filter((v): v is string => !!v);
      if (objectIds.length) {
        const objects = await tx
          .select({ key: storedObject.objectKey })
          .from(storedObject)
          .where(inArray(storedObject.id, objectIds));
        objectKeys.push(...objects.map((o) => o.key));
      }
      documents = docs.length;
      if (docs.length)
        await tx.delete(driverDocument).where(eq(driverDocument.customerId, cust.id));

      const erasedDrivers = await tx
        .update(driver)
        .set({
          fullName: 'Removed',
          dateOfBirth: null,
          email: null,
          phone: null,
          licenceNumber: null,
          licenceCountry: null,
          licenceType: null,
          licenceIssuedOn: null,
          licenceExpiresOn: null,
          eligibilitySummary: null,
          isSavedForReuse: false,
          updatedAt: sql`now()`,
        })
        .where(eq(driver.customerId, cust.id))
        .returning({ id: driver.id });
      drivers = erasedDrivers.length;

      await tx
        .update(customer)
        .set({
          fullName: 'Closed account',
          email: null,
          emailNormalized: null,
          phone: null,
          address: {},
          communicationPrefs: {},
          status: 'closed',
          version: sql`${customer.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(customer.id, cust.id));
    }
    // what we sent them: keep that a message went out, drop who it went to and what it said; and
    // never send one that was still waiting
    const redacted = await tx
      .update(notification)
      .set({
        recipient: '[erased]',
        recipientRef: null,
        subject: null,
        body: '[erased]',
        variables: {},
        deliveryState: sql`case when ${notification.deliveryState} in ('queued','retried') then 'suppressed' else ${notification.deliveryState} end`,
        lastError: sql`case when ${notification.deliveryState} in ('queued','retried') then 'account_closed' else ${notification.lastError} end`,
        updatedAt: sql`now()`,
      })
      .where(
        or(
          eq(notification.recipientRef, accountId),
          sql`lower(${notification.recipient}) = lower(${oldEmail})`,
        ),
      )
      .returning({ id: notification.id });
    return { drivers, documents, messages: redacted.length, objectKeys };
  }

  // ---------------------------------------------------------------- telling the person

  private async tell(
    r: RequestRow,
    outcome: 'completed' | 'closed' | 'rejected',
    note: string | null,
    closed?: { email: string; name: string; locale: string },
  ) {
    try {
      const target =
        closed ??
        (await (async () => {
          const [acc] = await this.db
            .select()
            .from(account)
            .where(eq(account.id, r.accountId))
            .limit(1);
          return acc ? { email: acc.email, name: acc.displayName, locale: acc.localeCode } : null;
        })());
      if (!target) return;
      await this.notify.send({
        event: `privacy_request_${outcome}`,
        recipient: target.email,
        // a closed account has nothing left to link the message to
        recipientRef: closed ? undefined : r.accountId,
        localeCode: target.locale,
        variables: { name: target.name, note: note ?? '' },
        sourceType: 'privacy_request',
        sourceId: r.id,
        // used only where the template has not been seeded (an old database) — English
        fallback: {
          subject:
            outcome === 'rejected'
              ? 'Your data request could not be completed'
              : outcome === 'closed'
                ? 'Your account has been closed'
                : 'Your data request is complete',
          body:
            `Hi ${target.name},\n\n` +
            (outcome === 'rejected'
              ? 'We could not complete your data request.'
              : outcome === 'closed'
                ? 'As you asked, we have closed your account and erased your personal details.'
                : 'We have completed your data request.') +
            (note ? `\n\n${note}` : ''),
        },
      });
    } catch (err) {
      // telling the person is never allowed to undo what was done
      this.logger.warn({ requestId: r.id, err }, 'could not send the data-request notice');
    }
  }

  // ---------------------------------------------------------------- the data itself

  /** How many records each part of a download holds. */
  private summarise(data: Awaited<ReturnType<PrivacyService['buildExport']>>) {
    return {
      drivers: data.drivers.length,
      reservations: data.reservations.length,
      rentals: data.rentals.length,
      payments: data.payments.length,
      invoices: data.invoices.length,
      messages: data.messages.length,
      requests: data.dataRequests.length,
    };
  }

  /**
   * Everything held about this person that they are entitled to see (GDPR Art. 15): their account
   * and profile, saved drivers, reservations with their lines and driver details, rentals,
   * payments (never card numbers or processor references), invoices, consents given, messages sent,
   * their data requests and their sign-in history. Secrets — password hashes, tokens — are not
   * "their data" and are never included.
   */
  async buildExport(accountId: string) {
    const [acc] = await this.db.select().from(account).where(eq(account.id, accountId)).limit(1);
    if (!acc) throw AppError.notFound('account');
    const [cust] = await this.db
      .select()
      .from(customer)
      .where(eq(customer.accountId, accountId))
      .limit(1);

    const drivers = cust
      ? await this.db.select().from(driver).where(eq(driver.customerId, cust.id))
      : [];
    const documents = cust
      ? await this.db.select().from(driverDocument).where(eq(driverDocument.customerId, cust.id))
      : [];
    const reservations = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.accountId, accountId));
    const ids = reservations.map((r) => r.id);
    const refs = reservations.map((r) => r.reference);
    const lines = ids.length
      ? await this.db
          .select()
          .from(reservationLine)
          .where(inArray(reservationLine.reservationId, ids))
      : [];
    const resDrivers = ids.length
      ? await this.db
          .select()
          .from(reservationDriver)
          .where(inArray(reservationDriver.reservationId, ids))
      : [];
    const consents = ids.length
      ? await this.db
          .select()
          .from(consentSnapshot)
          .where(inArray(consentSnapshot.reservationId, ids))
      : [];
    const rentals = refs.length
      ? await this.db.select().from(rental).where(inArray(rental.reservationReference, refs))
      : [];
    const intents = refs.length
      ? await this.db
          .select()
          .from(paymentIntent)
          .where(inArray(paymentIntent.reservationReference, refs))
      : [];
    const invoices = refs.length
      ? await this.db.select().from(invoice).where(inArray(invoice.reservationReference, refs))
      : [];
    const messages = await this.db
      .select()
      .from(notification)
      .where(
        or(
          eq(notification.recipientRef, accountId),
          sql`lower(${notification.recipient}) = lower(${acc.email})`,
        ),
      )
      .orderBy(desc(notification.createdAt));
    const requests = await this.db
      .select()
      .from(privacyRequest)
      .where(eq(privacyRequest.accountId, accountId))
      .orderBy(desc(privacyRequest.createdAt));
    const sessions = await this.db
      .select()
      .from(session)
      .where(eq(session.accountId, accountId))
      .orderBy(desc(session.createdAt))
      .limit(200);

    const by = <T extends { reservationId: string }>(rows: T[], id: string) =>
      rows.filter((r) => r.reservationId === id);
    return {
      generatedAt: new Date().toISOString(),
      account: {
        email: acc.email,
        phone: acc.phone,
        displayName: acc.displayName,
        locale: acc.localeCode,
        timezone: acc.timezone,
        createdAt: iso(acc.createdAt),
        emailVerifiedAt: iso(acc.emailVerifiedAt),
        lastSignInAt: iso(acc.lastSignInAt),
      },
      profile: cust
        ? {
            fullName: cust.fullName,
            email: cust.email,
            phone: cust.phone,
            address: cust.address,
            communicationPrefs: cust.communicationPrefs,
            consents: cust.consents,
            locale: cust.localeCode,
            createdAt: iso(cust.createdAt),
          }
        : null,
      drivers: drivers.map((d) => ({
        fullName: d.fullName,
        dateOfBirth: d.dateOfBirth,
        email: d.email,
        phone: d.phone,
        licenceNumber: d.licenceNumber,
        licenceCountry: d.licenceCountry,
        licenceType: d.licenceType,
        licenceIssuedOn: d.licenceIssuedOn,
        licenceExpiresOn: d.licenceExpiresOn,
        documents: documents
          .filter((x) => x.driverId === d.id)
          .map((x) => ({
            type: x.docType,
            issuedOn: x.issuedOn,
            expiresOn: x.expiresOn,
            reviewState: x.reviewState,
          })),
      })),
      reservations: reservations.map((r) => ({
        reference: r.reference,
        state: r.state,
        channel: r.channel,
        category: r.categoryCode,
        pickupLocation: r.pickupLocationCode,
        returnLocation: r.returnLocationCode,
        pickupAt: iso(r.pickupAt),
        returnAt: iso(r.returnAt),
        currency: r.currency,
        subtotalMinor: r.subtotalMinor,
        taxMinor: r.taxMinor,
        totalMinor: r.totalMinor,
        paidMinor: r.paidMinor,
        confirmedAt: iso(r.confirmedAt),
        cancelledAt: iso(r.cancelledAt),
        createdAt: iso(r.createdAt),
        lines: by(lines, r.id).map((l) => ({
          kind: l.kind,
          code: l.code,
          label: l.label,
          quantity: l.quantity,
          unitMinor: l.unitMinor,
          amountMinor: l.amountMinor,
        })),
        drivers: by(resDrivers, r.id).map((d) => ({
          role: d.role,
          fullName: d.fullName,
          dateOfBirth: d.dateOfBirth,
          email: d.email,
          phone: d.phone,
          licenceNumber: d.licenceNumber,
          licenceCountry: d.licenceCountry,
          licenceExpiresOn: d.licenceExpiresOn,
        })),
        consents: by(consents, r.id).map((c) => ({
          kind: c.kind,
          documentVersion: c.documentVersion,
          acceptedAt: iso(c.acceptedAt),
        })),
      })),
      rentals: rentals.map((x) => ({
        reference: x.reference,
        reservationReference: x.reservationReference,
        state: x.state,
        scheduledPickupAt: iso(x.scheduledPickupAt),
        scheduledReturnAt: iso(x.scheduledReturnAt),
        pickedUpAt: iso(x.pickedUpAt),
        returnedAt: iso(x.returnedAt),
        odometerOutKm: x.odometerOutKm,
        odometerInKm: x.odometerInKm,
        fuelOutPct: x.fuelOutPct,
        fuelInPct: x.fuelInPct,
        currency: x.currency,
        settlementMinor: x.settlementMinor,
      })),
      payments: intents.map((p) => ({
        reservationReference: p.reservationReference,
        purpose: p.purpose,
        amountMinor: p.amountMinor,
        currency: p.currency,
        state: p.state,
        cardBrand: p.methodBrand,
        cardLast4: p.methodLast4,
        authorizedAt: iso(p.authorizedAt),
        capturedAt: iso(p.capturedAt),
        refundedMinor: p.refundedMinor,
      })),
      invoices: invoices.map((i) => ({
        number: i.number,
        reservationReference: i.reservationReference,
        kind: i.kind,
        currency: i.currency,
        subtotalMinor: i.subtotalMinor,
        taxMinor: i.taxMinor,
        totalMinor: i.totalMinor,
        issuedAt: iso(i.issuedAt),
      })),
      messages: messages.map((m) => ({
        event: m.event,
        channel: m.channel,
        subject: m.subject,
        state: m.deliveryState,
        sentAt: iso(m.sentAt),
        createdAt: iso(m.createdAt),
      })),
      dataRequests: requests.map((r) => ({
        kind: r.kind,
        status: r.status,
        detail: r.detail,
        resolutionNote: r.resolutionNote,
        createdAt: iso(r.createdAt),
        resolvedAt: iso(r.resolvedAt),
      })),
      signIns: sessions.map((s) => ({
        audience: s.audience,
        at: iso(s.createdAt),
        lastUsedAt: iso(s.lastUsedAt),
        device: s.userAgent,
        ip: s.ip,
      })),
    };
  }
}
