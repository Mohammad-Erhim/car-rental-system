import { Injectable } from '@nestjs/common';

import { InvoiceService } from './invoice.service';

/** SRS-ARC-001 — the only thing other modules may import from `invoice`. */
@Injectable()
export class InvoicePublic {
  constructor(private readonly invoices: InvoiceService) {}

  issueInvoice(reservationReference: string) {
    return this.invoices.issueInvoice(reservationReference);
  }

  issueCreditNote(reservationReference: string, amountMinor: number, reason: string) {
    return this.invoices.issueCreditNote(reservationReference, amountMinor, reason);
  }

  listForReservation(reservationReference: string) {
    return this.invoices.listForReservation(reservationReference);
  }

  getByNumber(number: string) {
    return this.invoices.getByNumber(number);
  }
}
