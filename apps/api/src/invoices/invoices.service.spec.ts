import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceDirection } from '@prisma/client';
import { calculateInvoiceImportAmounts, InvoicesService } from './invoices.service';

describe('invoice import calculations', () => {
  it('calculates amount and tax from the tax-inclusive total', () => {
    expect(calculateInvoiceImportAmounts('10000.00', '6')).toEqual({
      amountExcludingTax: '9433.96', taxAmount: '566.04',
    });
  });
});

describe('InvoicesService', () => {
  const prisma = {
    invoice: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new InvoicesService(prisma as never, audit as never);
  const dto = {
    projectId: '00000000-0000-4000-8000-000000000001',
    direction: InvoiceDirection.RECEIVED,
    issuedOn: '2026-07-22',
    invoiceType: '增值税普通发票',
    invoicePlatform: '电子税务平台',
    buyerName: '测试购买方',
    amountExcludingTax: '9433.96',
    taxRate: '0.06',
    taxAmount: '566.04',
    totalAmount: '10000.00',
  };

  beforeEach(() => vi.clearAllMocks());

  it('creates an invoice with the simplified fields', async () => {
    prisma.invoice.create.mockResolvedValue({
      id: 'invoice-id', ...dto, kind: 'BLUE', totalAmount: { toString: () => '10000.00' },
    });

    await service.create(dto, 'admin-id');

    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      projectId: dto.projectId,
      direction: InvoiceDirection.RECEIVED,
      invoiceType: dto.invoiceType,
      invoicePlatform: dto.invoicePlatform,
      buyerName: dto.buyerName,
      amountExcludingTax: dto.amountExcludingTax,
      kind: 'BLUE',
    }) }));
  });

  it('rejects a tax amount inconsistent with amount and rate', async () => {
    await expect(service.create({ ...dto, taxAmount: '500.00', totalAmount: '9933.96' }, 'admin-id'))
      .rejects.toThrow('税额必须等于金额乘以税率');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a total inconsistent with amount and tax', async () => {
    await expect(service.create({ ...dto, totalAmount: '10001.00' }, 'admin-id'))
      .rejects.toThrow('价税合计必须等于金额加税额');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});
