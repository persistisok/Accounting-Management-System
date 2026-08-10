import { statusLabels } from '../lib/format';

const good = new Set(['ACTIVE', 'ARCHIVED', 'SIGNED', 'MATCHED', 'APPROVED', 'CONFIRMED', 'PAID', 'NORMAL', 'IN', 'ISSUED']);
const warn = new Set(['PARTIAL', 'PENDING', 'UNPAID', 'DRAFT']);
const bad = new Set(['VOID', 'REJECTED', 'REVERSED', 'TERMINATED', 'ABORTED']);

export function StatusChip({ value }: { value: string }) {
  const tone = good.has(value) ? 'good' : warn.has(value) ? 'warn' : bad.has(value) ? 'bad' : 'neutral';
  return <span className={`status-chip ${tone}`}>{statusLabels[value] ?? value}</span>;
}
