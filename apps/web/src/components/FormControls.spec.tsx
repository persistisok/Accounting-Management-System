import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './FormControls';

describe('MoneyInput', () => {
  it('uses decimal input semantics and the spinner-free style', () => {
    render(<MoneyInput aria-label="合同金额" name="amount" min="0.01" required />);

    const input = screen.getByLabelText('合同金额');
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('step')).toBe('0.01');
    expect(input.classList.contains('money-input')).toBe(true);
  });
});
