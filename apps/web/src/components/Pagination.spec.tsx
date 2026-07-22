import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('navigates between server-side result pages', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={86} onPageChange={onPageChange} />);

    expect(screen.getByText('21-40')).toBeTruthy();
    expect(screen.getByText('第 2 / 5 页')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('stays hidden when all rows fit on one page', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={20} onPageChange={() => undefined} />);
    expect(container.childElementCount).toBe(0);
  });
});
