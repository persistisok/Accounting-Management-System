import { describe, expect, it } from 'vitest';
import { calculateDonationAmounts } from './DonationReceiptsPage';

describe('calculateDonationAmounts', () => {
  it('calculates tax-exclusive amount and tax from the total', () => {
    expect(calculateDonationAmounts('10000', '6')).toEqual({ amountExcludingTax: '9433.96', taxAmount: '566.04' });
  });

  it('supports zero tax and waits for both inputs', () => {
    expect(calculateDonationAmounts('100', '0')).toEqual({ amountExcludingTax: '100.00', taxAmount: '0.00' });
    expect(calculateDonationAmounts('100', '')).toEqual({ amountExcludingTax: '', taxAmount: '' });
  });
});
