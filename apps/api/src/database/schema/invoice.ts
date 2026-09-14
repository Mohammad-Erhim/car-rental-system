import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns } from './_helpers';

/**
 * DAT-INVOICE-COUNTER — one gapless, per-organization sequence for invoice numbers. Incremented
 * atomically via an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` inside the same transaction
 * as the invoice row it numbers, so two concurrent issuances can never collide or skip.
 */
export const invoiceCounter = pgTable('invoice_counter', {
  organizationId: uuid('organization_id').primaryKey(),
  nextNumber: integer('next_number').notNull().default(1),
});

/**
 * DAT-INVOICE — a formal, immutable billing document. Each row is issued once and never edited;
 * a refund or cancellation after issuance creates a new `credit_note` row (`docVersion` + 1,
 * `previousInvoiceId` pointing back) rather than mutating the original — the original invoice
 * remains the permanent record of what was originally charged (SRS-PAY, standard accounting
 * practice: corrections are new documents, not silent edits). `snapshot` freezes the organization's
 * legal identity + customer + line items at issue time, so a later change to the org's legal
 * profile (or the reservation) can never alter a document that has already gone out.
 */
export const invoice = pgTable(
  'invoice',
  {
    ...auditColumns,
    organizationId: uuid('organization_id').notNull(),
    reservationReference: text('reservation_reference').notNull(),
    /** org-sequential, gapless, human-facing: e.g. "INV-000123". Unique per org. */
    number: text('number').notNull(),
    /** 1 = the original invoice; 2+ = credit notes issued against it, in order. */
    docVersion: integer('doc_version').notNull().default(1),
    /** null for the original invoice; the invoice a credit note corrects, for 2+. */
    previousInvoiceId: uuid('previous_invoice_id'),
    kind: text('kind').notNull().default('invoice'), // invoice|credit_note
    currency: text('currency').notNull(),
    subtotalMinor: integer('subtotal_minor').notNull(),
    taxMinor: integer('tax_minor').notNull(),
    /** positive for an invoice; negative for a credit note (amount returned to the customer). */
    totalMinor: integer('total_minor').notNull(),
    /** why a credit note was issued (refund/cancellation reason code); null for the original. */
    reason: text('reason'),
    /** frozen org legal identity + customer + trip + line items at the moment of issue. */
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    numberUnq: uniqueIndex('invoice_org_number_unq').on(t.organizationId, t.number),
    resIdx: index('invoice_reservation_idx').on(t.reservationReference, t.docVersion),
  }),
);
