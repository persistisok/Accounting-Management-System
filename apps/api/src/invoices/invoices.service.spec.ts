import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCategory, InvoiceCollectionStatus, InvoiceDirection } from '@prisma/client';
import { calculateInvoiceImportAmounts, directionForCategory, InvoicesService } from './invoices.service';

describe('invoice import calculations', () => {
  it('calculates amount and tax from the tax-inclusive total', () => {
    expect(calculateInvoiceImportAmounts('10000.00', '6')).toEqual({
      amountExcludingTax: '9433.96', taxAmount: '566.04',
    });
  });

  it('derives invoice direction from its business category', () => {
    expect(directionForCategory(InvoiceCategory.SUPPORT_RECEIPT_ISSUED)).toBe(InvoiceDirection.ISSUED);
    expect(directionForCategory(InvoiceCategory.MEMBER_DUE_ISSUED)).toBe(InvoiceDirection.ISSUED);
    expect(directionForCategory(InvoiceCategory.EXECUTION_PAYMENT_RECEIVED)).toBe(InvoiceDirection.RECEIVED);
    expect(directionForCategory(InvoiceCategory.EXPERT_FEE_RECEIVED)).toBe(InvoiceDirection.RECEIVED);
  });
});

describe('InvoicesService', () => {
  const prisma = {
    invoice: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
    attachment: { findMany: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn() },
    project: { findFirst: vi.fn() },
    expertProfile: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new InvoicesService(prisma as never, audit as never);
  const dto = {
    projectId: '00000000-0000-4000-8000-000000000001',
    category: InvoiceCategory.EXECUTION_PAYMENT_RECEIVED,
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
      id: 'invoice-id', ...dto, direction: InvoiceDirection.RECEIVED, membershipId: null, kind: 'BLUE', totalAmount: { toString: () => '10000.00' },
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

  it('creates a member due invoice without a project', async () => {
    const memberDto = { ...dto, category: InvoiceCategory.MEMBER_DUE_ISSUED, projectId: undefined, membershipId: '00000000-0000-4000-8000-000000000002' };
    prisma.membership.findFirst.mockResolvedValue({ id: memberDto.membershipId });
    prisma.invoice.create.mockResolvedValue({
      id: 'member-invoice-id', ...memberDto, projectId: null, direction: InvoiceDirection.ISSUED,
      membership: { id: memberDto.membershipId, memberName: '测试会员', memberType: '个人会员' },
      kind: 'BLUE', totalAmount: { toString: () => '10000.00' },
    });

    await service.create(memberDto, 'admin-id');

    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      membershipId: memberDto.membershipId,
      direction: InvoiceDirection.ISSUED,
      category: InvoiceCategory.MEMBER_DUE_ISSUED,
    }) }));
  });

  it('allows a member due invoice to optionally reference a project', async () => {
    const membershipId = '00000000-0000-4000-8000-000000000002';
    const memberProjectDto = { ...dto, category: InvoiceCategory.MEMBER_DUE_ISSUED, membershipId };
    prisma.membership.findFirst.mockResolvedValue({ id: membershipId });
    prisma.project.findFirst.mockResolvedValue({ id: dto.projectId });
    prisma.invoice.create.mockResolvedValue({
      id: 'member-project-invoice-id', ...memberProjectDto, direction: InvoiceDirection.ISSUED,
      kind: 'BLUE', totalAmount: { toString: () => '10000.00' },
    });

    await service.create(memberProjectDto, 'admin-id');

    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ membershipId, projectId: dto.projectId }),
    }));
  });

  it('requires an expert for an expert fee invoice', async () => {
    await expect(service.create({ ...dto, category: InvoiceCategory.EXPERT_FEE_RECEIVED }, 'admin-id'))
      .rejects.toThrow('必须关联项目和专家');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('creates an expert fee invoice with an approved active expert', async () => {
    const expertProfileId = '00000000-0000-4000-8000-000000000003';
    const expertDto = { ...dto, category: InvoiceCategory.EXPERT_FEE_RECEIVED, expertProfileId };
    prisma.expertProfile.findFirst.mockResolvedValue({ id: expertProfileId });
    prisma.invoice.create.mockResolvedValue({
      id: 'expert-invoice-id', ...expertDto, membershipId: null, direction: InvoiceDirection.RECEIVED,
      kind: 'BLUE', totalAmount: { toString: () => '10000.00' },
    });

    await service.create(expertDto, 'admin-id');

    expect(prisma.expertProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: expertProfileId, reviewStatus: 'APPROVED', status: 'ACTIVE' }),
    }));
    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ expertProfileId }),
    }));
  });

  it('rejects a reversed invoice date range', async () => {
    await expect(service.list({ page: 1, pageSize: 20, issuedFrom: '2026-08-01', issuedTo: '2026-07-01' }))
      .rejects.toThrow('结束时间不能早于起始时间');
  });

  it('filters member tickets by committee and returns totals for all filtered rows', async () => {
    prisma.invoice.findMany.mockReturnValue('items-query');
    prisma.invoice.count.mockReturnValue('count-query');
    prisma.invoice.aggregate.mockReturnValue('summary-query');
    prisma.$transaction.mockResolvedValue([[], 12, { _count: { _all: 12 }, _sum: { totalAmount: { toFixed: () => '36000.00' } } }, [{ membershipId: 'member-1' }, { membershipId: 'member-2' }], 3]);
    prisma.attachment.findMany.mockResolvedValue([]);

    await expect(service.list({
      page: 1, pageSize: 20, category: InvoiceCategory.MEMBER_DUE_ISSUED,
      committeeId: '00000000-0000-4000-8000-000000000004',
    })).resolves.toMatchObject({ total: 12, summary: { count: 12, totalAmount: '36000.00', collectedMemberCount: 2, pendingCount: 3 } });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ membership: { committeeId: '00000000-0000-4000-8000-000000000004' } }),
    }));
  });

  it('automatically collects uniquely matched members and keeps unmatched rows pending during import', async () => {
    const csv = [
      '交款人姓名,关联项目编码（可选）,发票日期,发票类型,开票平台,价税合计,税率（%）',
      '张三,,2026/09/01,电子票,税务平台,1000.00,0',
      '未入库人员,,2026/09/02,电子票,税务平台,800.00,0',
    ].join('\r\n');
    prisma.membership.findMany
      .mockResolvedValueOnce([{ id: '00000000-0000-4000-8000-000000000002' }])
      .mockResolvedValueOnce([]);
    const createSpy = vi.spyOn(service, 'create').mockResolvedValue({} as never);

    const result = await service.importInvoices({ originalname: 'member.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) }, {
      id: 'admin-id', username: 'admin', displayName: '系统管理员', role: 'SYSTEM_ADMIN', projectManagerId: null, projectIds: [], permissions: [],
    }, InvoiceCategory.MEMBER_DUE_ISSUED);

    expect(result).toMatchObject({ total: 2, successCount: 2, failureCount: 0, collectedCount: 1, pendingCount: 1 });
    expect(createSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      membershipId: '00000000-0000-4000-8000-000000000002', buyerName: '张三',
    }), 'admin-id', expect.anything(), expect.objectContaining({ payerName: '张三', allowPendingCollection: false }));
    expect(createSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      membershipId: undefined, buyerName: '未入库人员',
    }), 'admin-id', expect.anything(), expect.objectContaining({ payerName: '未入库人员', allowPendingCollection: true }));
    createSpy.mockRestore();
  });

  it('lets an administrator confirm a pending member ticket collection', async () => {
    const membershipId = '00000000-0000-4000-8000-000000000002';
    prisma.invoice.findFirst.mockResolvedValue({
      id: 'invoice-id', status: 'NORMAL', membershipId: null, collectionStatus: InvoiceCollectionStatus.PENDING,
    });
    prisma.membership.findFirst.mockResolvedValue({ id: membershipId });
    prisma.invoice.update.mockResolvedValue({
      id: 'invoice-id', membershipId, collectionStatus: InvoiceCollectionStatus.COLLECTED,
    });

    await service.collectMemberInvoice('invoice-id', membershipId, 'admin-id');

    expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invoice-id' },
      data: expect.objectContaining({ membershipId, collectionStatus: InvoiceCollectionStatus.COLLECTED, collectedById: 'admin-id' }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'COLLECT', objectId: 'invoice-id' }));
  });
});
