import { describe, expect, it, vi } from 'vitest';
import { DonationReceiptsService } from './donation-receipts.service';

const admin = { id: 'admin-id', username: 'admin', displayName: '管理员', role: 'SYSTEM_ADMIN', projectManagerId: null, projectIds: [], permissions: [] } as const;

describe('DonationReceiptsService', () => {
  it('creates a scoped receipt and records the operation', async () => {
    const receipt = { id: 'receipt-id', receiptNumber: 'D-001', projectId: 'project-id', donorId: 'donor-id', amount: { toString: () => '1000.00' } };
    const prisma = {
      project: { findFirst: vi.fn(async () => ({ id: 'project-id' })) },
      organization: { findFirst: vi.fn(async () => ({ id: 'donor-id' })) },
      donationReceipt: { findFirst: vi.fn(async () => null), create: vi.fn(async () => receipt) },
    };
    const audit = { record: vi.fn() };
    const service = new DonationReceiptsService(prisma as never, audit as never);

    await expect(service.create({ receiptNumber: ' D-001 ', projectId: 'project-id', donorId: 'donor-id', issuedOn: '2026-09-07', amount: '1000.00' }, 'admin-id', admin as never)).resolves.toBe(receipt);
    expect(prisma.donationReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ receiptNumber: 'D-001', amount: '1000.00' }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', objectType: 'DONATION_RECEIPT' }));
  });

  it('limits a PM to the bound project manager scope', async () => {
    const prisma = {
      project: { findFirst: vi.fn(async () => null) },
      organization: { findFirst: vi.fn(async () => ({ id: 'donor-id' })) },
      donationReceipt: { findFirst: vi.fn(async () => null) },
    };
    const service = new DonationReceiptsService(prisma as never, { record: vi.fn() } as never);
    const pm = { ...admin, role: 'PM', projectManagerId: 'pm-id' };

    await expect(service.create({ receiptNumber: 'D-002', projectId: 'other-project', donorId: 'donor-id', issuedOn: '2026-09-07', amount: '100.00' }, 'pm-account', pm as never)).rejects.toThrow('不在当前账号授权范围内');
    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: { pmUserId: 'pm-id' } }) }));
  });

  it('returns filtered count and amount for the full result set', async () => {
    const prisma = {
      donationReceipt: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
      attachment: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async () => [[{ id: 'receipt-id' }], 3, { _sum: { amount: '3200.50' } }]),
    };
    const service = new DonationReceiptsService(prisma as never, { record: vi.fn() } as never);
    await expect(service.list({ page: 1, pageSize: 20, q: 'D-001' }, admin as never)).resolves.toMatchObject({ total: 3, summary: { count: 3, amount: '3200.50' } });
  });
});
