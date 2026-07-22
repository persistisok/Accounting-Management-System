import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DateInput, MoneyInput, SearchableSelect } from './FormControls';

afterEach(cleanup);

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

describe('SearchableSelect', () => {
  it('filters options and submits the selected value', () => {
    const { container } = render(<form><SearchableSelect name="pmUserId" ariaLabel="负责 PM" required options={[
      { value: 'pm-1', label: '林知夏 · 项目部' },
      { value: 'pm-2', label: '王明 · 财务部' },
    ]} /></form>);

    const input = screen.getByRole('combobox', { name: '负责 PM' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '林知' } });
    expect(screen.queryByRole('option', { name: '王明 · 财务部' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: '林知夏 · 项目部' }));

    expect(new FormData(container.querySelector('form')!).get('pmUserId')).toBe('pm-1');
    expect((input as HTMLInputElement).value).toBe('林知夏 · 项目部');
  });
});

describe('DateInput', () => {
  it('shows a Chinese date while submitting the ISO date', () => {
    const { container } = render(<form><DateInput name="joinedOn" aria-label="入会日期" defaultValue="2026-07-22" /></form>);

    expect((screen.getByLabelText('入会日期') as HTMLInputElement).value).toBe('2026年07月22日');
    expect(new FormData(container.querySelector('form')!).get('joinedOn')).toBe('2026-07-22');
  });

  it('uses the Chinese date placeholder when empty', () => {
    render(<DateInput name="joinedOn" aria-label="入会日期" />);
    expect(screen.getByPlaceholderText('年/月/日')).toBeTruthy();
  });
});
