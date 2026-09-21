import { describe, expect, it } from 'vitest';

import {
  customerMetadata,
  paymentDescription,
  paymentMetadata,
  purposeKind,
  refundMetadata,
  type PaymentContext,
} from './stripe-metadata';

const ctx: PaymentContext = {
  reservationReference: 'RES-1',
  paymentIntentId: 'pay-uuid',
  purpose: 'booking',
  customerId: 'acct-uuid',
  channel: 'web',
  quoteReference: 'Q-1',
  environment: 'production',
};

describe('stripe metadata (DEC-036)', () => {
  it('reduces our purpose keys to the kind of payment', () => {
    expect(purposeKind('booking')).toBe('booking');
    expect(purposeKind('extension-1789960642317')).toBe('extension');
    expect(purposeKind('modification-1789960642317')).toBe('modification');
    expect(purposeKind('')).toBe('payment');
  });

  it('describes a payment as a label and the reference only', () => {
    expect(paymentDescription({ purpose: 'booking', reservationReference: 'RES-1' })).toBe(
      'Booking RES-1',
    );
    expect(paymentDescription({ purpose: 'extension-9', reservationReference: 'RES-1' })).toBe(
      'Extension RES-1',
    );
    expect(paymentDescription({ purpose: 'modification-9', reservationReference: 'RES-1' })).toBe(
      'Booking change RES-1',
    );
    // an unknown purpose still reads sensibly
    expect(paymentDescription({ purpose: 'deposit-1', reservationReference: 'RES-1' })).toBe(
      'Deposit RES-1',
    );
  });

  it('carries only ids, and stays inside Stripe limits', () => {
    const md = paymentMetadata(ctx);
    expect(Object.keys(md).sort()).toEqual([
      'channel',
      'customer_id',
      'env',
      'payment_id',
      'purpose',
      'quote_reference',
      'reservation_reference',
      'source',
    ]);
    expect(Object.keys(md).length).toBeLessThanOrEqual(50);
    for (const [k, v] of Object.entries(md)) {
      expect(k.length).toBeLessThanOrEqual(40);
      expect(v.length).toBeLessThanOrEqual(500);
    }
  });

  it('never sends an empty or null value (Stripe would unset or reject it)', () => {
    const md = paymentMetadata({ ...ctx, customerId: null, channel: null, quoteReference: '' });
    expect(md).not.toHaveProperty('channel');
    expect(md).not.toHaveProperty('quote_reference');
    expect(md.customer_id).toBe('guest');
    for (const v of Object.values(md)) expect(v).not.toBe('');
  });

  it('gives the Stripe customer ids only', () => {
    expect(customerMetadata(ctx)).toEqual({
      source: 'carrental',
      env: 'production',
      customer_id: 'acct-uuid',
      reservation_reference: 'RES-1',
    });
  });

  it('ties a refund back to the payment it refunds', () => {
    expect(refundMetadata({ ...ctx, purpose: 'extension-5' })).toEqual({
      source: 'carrental',
      env: 'production',
      reservation_reference: 'RES-1',
      payment_id: 'pay-uuid',
      purpose: 'extension',
    });
  });
});
