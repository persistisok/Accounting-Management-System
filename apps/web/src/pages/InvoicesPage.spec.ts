import { describe, expect, it } from 'vitest';
import { calculateInvoiceAmounts } from './InvoicesPage';

describe('calculateInvoiceAmounts', () => {
  it('calculates the amount and tax from a tax-inclusive total', () => {
    expect(calculateInvoiceAmounts('10000', '6')).toEqual({ amountExcludingTax: '9433.96', taxAmount: '566.04' });
  });

  it('rounds calculated values to cents', () => {
    expect(calculateInvoiceAmounts('112.99', '13')).toEqual({ amountExcludingTax: '99.99', taxAmount: '13.00' });
  });

  it('keeps calculated fields empty until both inputs are present', () => {
    expect(calculateInvoiceAmounts('100', '')).toEqual({ amountExcludingTax: '', taxAmount: '' });
  });

  it('supports a zero tax rate', () => {
    expect(calculateInvoiceAmounts('100', '0')).toEqual({ amountExcludingTax: '100.00', taxAmount: '0.00' });
  });
});
