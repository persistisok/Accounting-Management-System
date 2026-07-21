import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BankingService } from './banking.service';

const transaction = {
  id: '00000000-0000-0000-0000-000000000020',
  sourceType: 'MANUAL',
  settlementApplicable: true,
  matchStatus: 'UNMATCHED',
  amount: { toString: () => '100.00' },
  counterpartyName: '测试付款方',
  allocations: [] as { id: string }[],
};

describe('BankingService transaction safeguards', () => {
  const audit = { record: vi.fn() };
  const prisma = { bankTransaction: { findUnique: vi.fn(), update: vi.fn() } };
  let service: BankingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BankingService(prisma as never, audit as never);
  });

  it('rejects editing a transaction with confirmed allocations', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({ ...transaction, allocations: [{ id: 'allocation-1' }] });

    await expect(service.updateTransaction(transaction.id, { amount: '120.00' }, 'admin-id')).rejects.toThrow('请先撤销全部分配');
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
  });

  it('rejects excluding a transaction with confirmed allocations', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({ ...transaction, allocations: [{ id: 'allocation-1' }] });

    await expect(service.excludeTransaction(transaction.id, 'admin-id')).rejects.toThrow('请先撤销全部分配');
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
  });

  it('logically excludes an unallocated transaction and audits the action', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue(transaction);
    prisma.bankTransaction.update.mockResolvedValue({ ...transaction, settlementApplicable: false, matchStatus: 'EXCLUDED' });

    const result = await service.excludeTransaction(transaction.id, 'admin-id');

    expect(prisma.bankTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: transaction.id }, data: { settlementApplicable: false, matchStatus: 'EXCLUDED' },
    }));
    expect(result.matchStatus).toBe('EXCLUDED');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', objectType: 'BANK_TRANSACTION' }));
  });
});
