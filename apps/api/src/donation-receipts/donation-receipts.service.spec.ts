import { describe, expect, it, vi } from 'vitest';
import { DonationReceiptsService } from './donation-receipts.service';

const dto = {
  donorName: '张三', phone: '13800138000', issuedOn: '2026-09-07', invoiceType: '电子发票',
  invoicePlatform: '公益平台', sellerName: '示例基金会', totalAmount: '10000.00', taxRate: '0.06',
  amountExcludingTax: '9433.96', taxAmount: '566.04',
};
const money = (value: string) => ({ toString: () => value });
const receipt = {
  id: 'receipt-id', donorName: '张三', phoneEncrypted: 'encrypted', phoneMasked: '138****8000', issuedOn: new Date('2026-09-07'),
  invoiceType: '电子发票', invoicePlatform: '公益平台', sellerName: '示例基金会', totalAmount: money('10000.00'),
  taxRate: money('0.06'), amountExcludingTax: money('9433.96'), taxAmount: money('566.04'), status: 'NORMAL' as const,
};
const sensitive = { encrypt: vi.fn(() => 'encrypted'), maskPhone: vi.fn(() => '138****8000') };

describe('DonationReceiptsService', () => {
  it('creates an independent receipt with encrypted phone and audit record', async () => {
    const prisma = { donationReceipt: { create: vi.fn(async () => receipt) } };
    const audit = { record: vi.fn() };
    const service = new DonationReceiptsService(prisma as never, audit as never, sensitive as never);

    await expect(service.create(dto, 'admin-id')).resolves.not.toHaveProperty('phoneEncrypted');
    expect(prisma.donationReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ donorName: '张三', phoneEncrypted: 'encrypted', totalAmount: '10000.00' }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', objectType: 'DONATION_RECEIPT' }));
  });

  it('rejects inconsistent tax amounts', async () => {
    const service = new DonationReceiptsService({} as never, { record: vi.fn() } as never, sensitive as never);
    await expect(service.create({ ...dto, taxAmount: '500.00' }, 'admin-id')).rejects.toThrow('税额必须等于金额乘以税率');
  });

  it('returns filtered effective count and tax-inclusive total', async () => {
    const prisma = {
      donationReceipt: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
      attachment: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async () => [[{ id: 'receipt-id' }], 4, 3, { _sum: { totalAmount: '3200.50' } }]),
    };
    const service = new DonationReceiptsService(prisma as never, { record: vi.fn() } as never, sensitive as never);
    await expect(service.list({ page: 1, pageSize: 20, q: '张三' })).resolves.toMatchObject({ total: 4, summary: { count: 3, amount: '3200.50' } });
  });
});
