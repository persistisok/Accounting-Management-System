import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DEFAULT_PAGE_SIZE = 20;

export function Pagination({ page, pageSize = DEFAULT_PAGE_SIZE, total, onPageChange, compact = false }: {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const currentPage = Math.min(page, totalPages);
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPage + index);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, total);

  return <nav className={`pagination${compact ? ' compact' : ''}`} aria-label="分页">
    <span className="pagination-summary"><strong>{firstItem}-{lastItem}</strong> / {total}</span>
    <div className="pagination-controls">
      <button type="button" aria-label="上一页" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}><ChevronLeft size={15} /></button>
      <span className="pagination-pages">{pageNumbers.map((number) => <button
        type="button"
        key={number}
        aria-label={`第 ${number} 页`}
        aria-current={number === currentPage ? 'page' : undefined}
        className={number === currentPage ? 'active' : undefined}
        onClick={() => onPageChange(number)}
      >{number}</button>)}</span>
      <button type="button" aria-label="下一页" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}><ChevronRight size={15} /></button>
    </div>
    <span className="pagination-position">第 {currentPage} / {totalPages} 页</span>
  </nav>;
}
