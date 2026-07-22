import { describe, expect, it } from 'vitest';
import { calculateInvoiceAmounts } from './InvoicesPage';

describe('calculateInvoiceAmounts', () => {
  it('calculates tax and total from a percentage rate', () => {
    expect(calculateInvoiceAmounts('100', '6')).toEqual({ taxAmount: '6.00', totalAmount: '106.00' });
  });

  it('rounds calculated values to cents', () => {
    expect(calculateInvoiceAmounts('99.99', '13')).toEqual({ taxAmount: '13.00', totalAmount: '112.99' });
  });

  it('keeps calculated fields empty until both inputs are present', () => {
    expect(calculateInvoiceAmounts('100', '')).toEqual({ taxAmount: '', totalAmount: '' });
  });
});
