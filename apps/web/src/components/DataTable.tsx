import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { EmptyState } from './States';

export interface TableColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
}

type ColumnWidths = Record<string, number>;

function currentUserId() {
  try {
    if (typeof localStorage === 'undefined') return 'anonymous';
    const user = JSON.parse(localStorage.getItem('ledger_user') ?? '{}') as { id?: string };
    return user.id ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function saveWidths(tableId: string, widths: ColumnWidths) {
  try {
    localStorage.setItem(widthStorageKey(tableId), JSON.stringify(widths));
  } catch {
    // Column resizing remains available for the session when browser storage is unavailable.
  }
}

function widthStorageKey(tableId: string) {
  return `pms:table-widths:${currentUserId()}:${tableId}`;
}

function loadWidths(tableId: string): ColumnWidths {
  try {
    return JSON.parse(localStorage.getItem(widthStorageKey(tableId)) ?? '{}') as ColumnWidths;
  } catch {
    return {};
  }
}

function completeWidths(tableId: string, columnKeys: string[]) {
  const saved = loadWidths(tableId);
  return columnKeys.every((key) => Number.isFinite(saved[key]) && saved[key]! > 0) ? saved : {};
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, footer, emptyState, tableId, className }: {
  columns: TableColumn<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; footer?: ReactNode; emptyState?: ReactNode; tableId?: string; className?: string;
}) {
  const columnKeys = columns.map((column) => column.key);
  const columnKeySignature = columnKeys.join('.');
  const resolvedTableId = tableId ?? `${typeof window === 'undefined' ? 'table' : window.location.pathname}:${columnKeySignature}`;
  const [widths, setWidths] = useState<ColumnWidths>(() => completeWidths(resolvedTableId, columnKeys));

  useEffect(() => {
    setWidths(completeWidths(resolvedTableId, columnKeys));
  }, [resolvedTableId, columnKeySignature]);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>, column: TableColumn<T>) {
    event.preventDefault();
    event.stopPropagation();
    const header = event.currentTarget.parentElement;
    if (!header) return;
    const headerCells = Array.from(header.parentElement?.children ?? []) as HTMLElement[];
    const baseWidths = Object.fromEntries(columns.map((item, index) => [
      item.key,
      Math.round(headerCells[index]?.getBoundingClientRect().width ?? 120),
    ]));
    const startX = event.clientX;
    const startWidth = baseWidths[column.key]!;
    document.body.classList.add('resizing-columns');

    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(1, Math.round(startWidth + moveEvent.clientX - startX));
      setWidths({ ...baseWidths, [column.key]: width });
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.body.classList.remove('resizing-columns');
      setWidths((current) => {
        saveWidths(resolvedTableId, current);
        return current;
      });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }

  function resetWidths() {
    setWidths({});
    saveWidths(resolvedTableId, {});
  }

  const columnStyle = (key: string): CSSProperties | undefined => widths[key]
    ? { width: widths[key], minWidth: widths[key], maxWidth: widths[key] }
    : undefined;
  const fixedLayout = columnKeys.every((key) => widths[key]);
  const tableWidth = fixedLayout ? columnKeys.reduce((total, key) => total + widths[key]!, 0) : undefined;

  if (rows.length === 0 && !footer) return emptyState ?? <EmptyState />;
  return (
    <div className="table-frame">
      {fixedLayout && <div className="table-column-tools"><button type="button" onClick={resetWidths}>恢复默认列宽</button></div>}
      <div className="table-wrap">
        <table className={`data-table${fixedLayout ? ' resized' : ''}${className ? ` ${className}` : ''}`} style={tableWidth ? { minWidth: tableWidth, width: tableWidth } : undefined}>
          {fixedLayout && <colgroup>{columns.map((column) => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup>}
          <thead><tr>{columns.map((column) => {
            const label = column.key === 'action' ? '操作' : column.label;
            return <th key={column.key} className={column.className} style={columnStyle(column.key)}><span>{label}</span><button type="button" className="column-resize-handle" aria-label={`调整${label}列宽`} title="拖动调整列宽" tabIndex={-1} onPointerDown={(event) => startResize(event, column)} /></th>;
          })}</tr></thead>
          <tbody>{rows.length ? rows.map((row) => (
            <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'clickable' : undefined}>
              {columns.map((column) => <td key={column.key} className={column.className} style={columnStyle(column.key)}>{column.render(row)}</td>)}
            </tr>
          )) : <tr className="table-empty-row"><td colSpan={columns.length}>{emptyState ?? <EmptyState />}</td></tr>}</tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
    </div>
  );
}
