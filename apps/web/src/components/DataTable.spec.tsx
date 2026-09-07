import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

const columns = [{ key: 'name', label: '姓名', render: (row: { id: string; name: string }) => row.name }];
const rows = [{ id: '1', name: '测试专家' }];
const twoColumns = [
  ...columns,
  { key: 'organization', label: '单位', render: () => '测试医院' },
];

describe('DataTable column resizing', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ledger_user', JSON.stringify({ id: 'user-1' }));
  });

  afterEach(cleanup);

  it('restores the current users saved column width', () => {
    localStorage.setItem('pms:table-widths:user-1:experts-test', JSON.stringify({ name: 246 }));
    render(<DataTable tableId="experts-test" columns={columns} rows={rows} rowKey={(row) => row.id} />);

    expect(screen.getByRole('columnheader', { name: /姓名/ }).style.width).toBe('246px');
  });

  it('persists a dragged width for the current user', () => {
    render(<DataTable tableId="experts-test" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const header = screen.getByRole('columnheader', { name: /姓名/ });
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ width: 120 } as DOMRect);

    fireEvent(screen.getByRole('button', { name: '调整姓名列宽' }), new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
    fireEvent(document, new MouseEvent('pointermove', { bubbles: true, clientX: 180 }));
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('pms:table-widths:user-1:experts-test') ?? '{}')).toEqual({ name: 200 });
  });

  it('locks every current width so resizing one column does not squeeze its neighbor', () => {
    render(<DataTable tableId="experts-test" columns={twoColumns} rows={rows} rowKey={(row) => row.id} />);
    const [nameHeader, organizationHeader] = screen.getAllByRole('columnheader');
    vi.spyOn(nameHeader!, 'getBoundingClientRect').mockReturnValue({ width: 140 } as DOMRect);
    vi.spyOn(organizationHeader!, 'getBoundingClientRect').mockReturnValue({ width: 220 } as DOMRect);

    fireEvent(screen.getByRole('button', { name: '调整姓名列宽' }), new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
    fireEvent(document, new MouseEvent('pointermove', { bubbles: true, clientX: 300 }));
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('pms:table-widths:user-1:experts-test') ?? '{}')).toEqual({ name: 340, organization: 220 });
    expect(nameHeader!.style.width).toBe('340px');
    expect(organizationHeader!.style.width).toBe('220px');
  });

  it('allows columns to shrink without a minimum and restores defaults with a button', () => {
    render(<DataTable tableId="experts-test" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const header = screen.getByRole('columnheader', { name: /姓名/ });
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ width: 120 } as DOMRect);

    fireEvent(screen.getByRole('button', { name: '调整姓名列宽' }), new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
    fireEvent(document, new MouseEvent('pointermove', { bubbles: true, clientX: -10 }));
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true }));

    expect(header.style.width).toBe('10px');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认列宽' }));
    expect(localStorage.getItem('pms:table-widths:user-1:experts-test')).toBe('{}');
    expect(screen.queryByRole('button', { name: '恢复默认列宽' })).toBeNull();
  });

  it('uses 操作 as the standard action column heading', () => {
    const actionColumns = [{ key: 'action', label: '', render: () => <button type="button">编辑</button> }];
    render(<DataTable tableId="actions-test" columns={actionColumns} rows={rows} rowKey={(row) => row.id} />);

    expect(screen.getByRole('columnheader', { name: /操作/ })).toBeTruthy();
  });
});
