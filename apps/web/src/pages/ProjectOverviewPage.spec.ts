import { describe, expect, it } from 'vitest';
import { collectionProgress } from './ProjectOverviewPage';

describe('project overview collection progress', () => {
  it('calculates the received share of support agreements', () => {
    expect(collectionProgress('600000.00', '800000.00')).toBe(75);
  });

  it('returns zero when there is no valid agreement amount', () => {
    expect(collectionProgress('100.00', '0.00')).toBe(0);
    expect(collectionProgress('invalid', '800.00')).toBe(0);
  });

  it('preserves over-collection percentages for display', () => {
    expect(collectionProgress('120.00', '100.00')).toBe(120);
  });
});
