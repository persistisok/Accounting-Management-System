import { describe, expect, it } from 'vitest';
import { roundMoney } from '../common/money';
import { ProjectPeriodUnit } from './projects.dto';
import { formatProjectCode, toPeriodMonths } from './projects.service';

describe('money summaries', () => {
  it('keeps two decimal places for financial API values', () => {
    expect(roundMoney(800000 - 600000)).toBe('200000.00');
    expect(roundMoney(0)).toBe('0.00');
  });
});

describe('project period normalization', () => {
  it('stores years and months as a canonical month count', () => {
    expect(toPeriodMonths('1', ProjectPeriodUnit.YEAR)).toBe(12);
    expect(toPeriodMonths('3', ProjectPeriodUnit.MONTH)).toBe(3);
  });

  it('rejects zero and fractional periods', () => {
    expect(() => toPeriodMonths('0', ProjectPeriodUnit.MONTH)).toThrow('项目周期必须是');
    expect(() => toPeriodMonths('1.5', ProjectPeriodUnit.YEAR)).toThrow('项目周期必须是');
  });
});

describe('project code formatting', () => {
  it('pads small sequences without truncating values above 999', () => {
    expect(formatProjectCode(2026, 1)).toBe('PRJ-2026-001');
    expect(formatProjectCode(2026, 999)).toBe('PRJ-2026-999');
    expect(formatProjectCode(2026, 1000)).toBe('PRJ-2026-1000');
  });
});
