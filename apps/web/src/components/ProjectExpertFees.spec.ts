import { describe, expect, it } from 'vitest';
import { calculateExpertTax } from './ProjectExpertFees';

describe('project expert fee tax summary', () => {
  it('uses the configured expert labor tax brackets', () => {
    expect(calculateExpertTax(800)).toBe(0);
    expect(calculateExpertTax(1000)).toBe(40);
    expect(calculateExpertTax(5000)).toBe(800);
    expect(calculateExpertTax(50000)).toBe(10000);
  });

  it('ignores invalid payment amounts', () => {
    expect(calculateExpertTax(Number.NaN)).toBe(0);
    expect(calculateExpertTax(-1)).toBe(0);
  });
});
