import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BankingService } from './banking.service';

const transaction = {
  id: '00000000-0000-4000-8000-000000000020',
  sourceType: 'MANUAL',
  settlementApplicable: true,
  matchStatus: 'UNMATCHED',
  direction: 'IN',
  amount: { toString: () => '100.00' },
  counterpartyName: '测试付款方',
  allocations: [] as Array<{
    id: string;
    category: 'SUPPORT_RECEIPT' | 'EXECUTION_PAYMENT';
    allocatedAmount: string;
    projectId: string | null;
    memberDueId: string | null;
  }>,
};

describe('BankingService transaction safeguards', () => {
  const audit = { record: vi.fn() };
  const sensitive = {
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
    hash: vi.fn((value: string) => `hash:${value}`),
    maskBank: vi.fn((value: string) => `**** ${value.slice(-4)}`),
  };
  const prisma = {
    bankAccount: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    bankTransaction: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
    bankAllocation: { create: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    project: { findFirst: vi.fn() },
    expertProfile: { findFirst: vi.fn() },
    membership: { findFirst: vi.fn() },
    memberDue: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: BankingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (input: unknown) => typeof input === 'function'
      ? (input as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(input as Promise<unknown>[]));
    prisma.project.findFirst.mockResolvedValue({ id: 'project-id' });
    service = new BankingService(prisma as never, audit as never, sensitive as never);
  });

  it('replaces the existing classification when editing a matched transaction', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({
      ...transaction,
      matchStatus: 'MATCHED',
      allocations: [{ id: 'allocation-1', projectId: 'old-project-id', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00', memberDueId: null }],
    });
    prisma.bankTransaction.findUniqueOrThrow.mockResolvedValue({ ...transaction, matchStatus: 'MATCHED' });

    await service.updateTransaction(transaction.id, {
      amount: '100.00', nature: '修改后性质', projectId: 'project-id', category: 'SUPPORT_RECEIPT',
    }, 'admin-id');

    expect(prisma.bankAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'REVERSED' } }));
    expect(prisma.bankAllocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      projectId: 'project-id', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00',
    }) }));
  });

  it('keeps the full transaction matched when its amount changes', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({
      ...transaction,
      matchStatus: 'MATCHED',
      allocations: [{ id: 'allocation-1', projectId: 'project-id', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00', memberDueId: null }],
    });
    prisma.bankTransaction.findUniqueOrThrow.mockResolvedValue({ ...transaction, matchStatus: 'MATCHED' });

    await service.updateTransaction(transaction.id, { amount: '120.00' }, 'admin-id');

    expect(prisma.bankTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matchStatus: 'MATCHED' }),
    }));
    expect(prisma.bankAllocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allocatedAmount: '120.00' }),
    }));
  });

  it('rejects a funding category that conflicts with the transaction direction', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({
      ...transaction,
      allocations: [{ id: 'allocation-1', projectId: 'project-id', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00', memberDueId: null }],
    });

    await expect(service.updateTransaction(transaction.id, { direction: 'OUT', category: 'SUPPORT_RECEIPT' }, 'admin-id')).rejects.toThrow('支出流水不能选择收入资金分类');
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
  });

  it('voids a matched transaction and reverses its confirmed allocations', async () => {
    prisma.bankTransaction.findUnique.mockResolvedValue({
      ...transaction,
      matchStatus: 'MATCHED',
      allocations: [{ id: 'allocation-1', projectId: 'project-id', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00', memberDueId: null }],
    });
    prisma.bankTransaction.update.mockResolvedValue({ ...transaction, settlementApplicable: false, matchStatus: 'EXCLUDED' });

    const result = await service.excludeTransaction(transaction.id, 'admin-id');

    expect(prisma.bankAllocation.updateMany).toHaveBeenCalledWith({
      where: { bankTransactionId: transaction.id, status: 'CONFIRMED' }, data: { status: 'REVERSED' },
    });
    expect(result.matchStatus).toBe('EXCLUDED');
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

  it('encrypts and masks new own-account numbers', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue(null);
    prisma.bankAccount.create.mockResolvedValue({
      id: 'account-id', bankName: '测试银行', accountNumberMasked: '**** 6789', status: 'ACTIVE', _count: { transactions: 0 },
    });

    await service.createAccount({ bankName: ' 测试银行 ', accountNumber: '1234 5678 9' }, 'admin-id');

    expect(prisma.bankAccount.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      accountName: '测试银行', bankName: '测试银行', accountNumberEncrypted: 'encrypted:123456789',
      accountNumberHash: 'hash:123456789', accountNumberMasked: '**** 6789',
    }) }));
  });

  it('stores counterparty bank details without returning encrypted values', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'account-id' });
    prisma.bankTransaction.create.mockResolvedValue({
      ...transaction,
      direction: 'IN',
      counterpartyAccountEncrypted: 'encrypted:6222000012345678',
      counterpartyAccountMasked: '**** 5678',
    });
    prisma.bankTransaction.findUniqueOrThrow.mockResolvedValue({
      ...transaction, direction: 'IN', counterpartyAccountEncrypted: 'encrypted:6222000012345678', counterpartyAccountMasked: '**** 5678',
    });

    const result = await service.createTransaction({
      bankAccountId: '00000000-0000-4000-8000-000000000001', projectId: '00000000-0000-4000-8000-000000000002', category: 'SUPPORT_RECEIPT', transactionAt: '2026-07-22T10:00:00',
      counterpartyName: '测试付款方', counterpartyBankName: '测试银行', counterpartyAccountNumber: '6222 0000 1234 5678',
      direction: 'IN', amount: '100.00', nature: '支持款',
    }, 'admin-id');

    expect(prisma.bankTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      counterpartyBankName: '测试银行', counterpartyAccountEncrypted: 'encrypted:6222000012345678', counterpartyAccountMasked: '**** 5678',
    }) }));
    expect(prisma.bankAllocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      projectId: '00000000-0000-4000-8000-000000000002', category: 'SUPPORT_RECEIPT', allocatedAmount: '100.00',
    }) }));
    expect(result).not.toHaveProperty('counterpartyAccountEncrypted');
  });

  it('links an expert fee to both the project and selected expert', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'account-id' });
    prisma.expertProfile.findFirst.mockResolvedValue({ id: 'expert-id' });
    prisma.bankTransaction.create.mockResolvedValue({ ...transaction, direction: 'OUT' });
    prisma.bankTransaction.findUniqueOrThrow.mockResolvedValue({ ...transaction, direction: 'OUT' });

    await service.createTransaction({
      bankAccountId: '00000000-0000-4000-8000-000000000001', projectId: '00000000-0000-4000-8000-000000000002',
      expertProfileId: '00000000-0000-4000-8000-000000000003', category: 'EXPERT_FEE', transactionAt: '2026-07-22T10:00:00',
      counterpartyName: '测试专家', counterpartyBankName: '测试银行', counterpartyAccountNumber: '6222000012345678',
      direction: 'OUT', amount: '500.00', nature: '专家费',
    }, 'admin-id');

    expect(prisma.expertProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000003', status: 'ACTIVE', reviewStatus: 'APPROVED' }),
    }));
    expect(prisma.bankAllocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      projectId: '00000000-0000-4000-8000-000000000002', expertProfileId: '00000000-0000-4000-8000-000000000003', category: 'EXPERT_FEE',
    }) }));
  });

  it('allocates a membership payment to the oldest outstanding dues without a project', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'account-id' });
    prisma.membership.findFirst
      .mockResolvedValueOnce({ id: 'member-id' })
      .mockResolvedValueOnce({
        id: 'member-id',
        dues: [
          { id: 'due-1', amountDue: '100.00', allocations: [{ allocatedAmount: '20.00' }] },
          { id: 'due-2', amountDue: '100.00', allocations: [] },
        ],
      });
    prisma.memberDue.findUniqueOrThrow.mockResolvedValue({ amountDue: '100.00' });
    prisma.bankAllocation.aggregate.mockResolvedValue({ _sum: { allocatedAmount: '100.00' } });
    prisma.bankTransaction.create.mockResolvedValue({ ...transaction, direction: 'IN' });
    prisma.bankTransaction.findUniqueOrThrow.mockResolvedValue({ ...transaction, direction: 'IN' });

    await service.createTransaction({
      bankAccountId: '00000000-0000-4000-8000-000000000001', membershipId: '00000000-0000-4000-8000-000000000004',
      category: 'MEMBER_DUE', transactionAt: '2026-07-22T10:00:00', counterpartyName: '测试会员',
      counterpartyBankName: '测试银行', counterpartyAccountNumber: '6222000012345678', direction: 'IN', amount: '120.00', nature: '会员会费',
    }, 'admin-id');

    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(prisma.bankAllocation.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({
      memberDueId: 'due-1', category: 'MEMBER_DUE', allocatedAmount: '80.00',
    }) }));
    expect(prisma.bankAllocation.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({
      memberDueId: 'due-2', category: 'MEMBER_DUE', allocatedAmount: '40.00',
    }) }));
    expect(prisma.memberDue.update).toHaveBeenCalledTimes(2);
  });

  it('rejects categories outside the four supported business categories', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'account-id' });
    await expect(service.createTransaction({
      bankAccountId: '00000000-0000-4000-8000-000000000001', projectId: '00000000-0000-4000-8000-000000000002',
      category: 'OTHER', transactionAt: '2026-07-22T10:00:00', counterpartyName: '测试对象',
      counterpartyBankName: '测试银行', counterpartyAccountNumber: '6222000012345678', direction: 'IN', amount: '100.00', nature: '其他',
    }, 'admin-id')).rejects.toThrow('资金分类仅支持');
  });
});
