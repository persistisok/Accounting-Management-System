import type { ReactNode } from 'react';
import { EmptyState } from './States';

export interface TableColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick }: {
  columns: TableColumn<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'clickable' : undefined}>
            {columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
