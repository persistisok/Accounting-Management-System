import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportDataset } from './exports.dto';
import { ExportsService } from './exports.service';

describe('ExportsService', () => {
  const prisma = {
    expertProfile: { count: vi.fn(), findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
  };
  const sensitive = { decrypt: vi.fn((value: string) => `plain:${value}`) };
  const audit = { record: vi.fn() };
  const user = { id: 'system-admin-id', role: 'SYSTEM_ADMIN', username: 'admin', displayName: '系统管理员', projectManagerId: null, permissions: [] } as const;
  let service: ExportsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExportsService(prisma as never, sensitive as never, audit as never);
    prisma.expertProfile.count.mockResolvedValue(1);
    prisma.attachment.findMany.mockResolvedValue([{ objectId: 'expert-id', fileName: '执业证.pdf' }]);
    prisma.expertProfile.findMany.mockResolvedValue([{
      id: 'expert-id', professionalTitle: '主任医师', bankName: '示例银行', bankAccountEncrypted: 'bank-cipher',
      joinedOn: new Date('2026-08-01T00:00:00.000Z'), status: 'ACTIVE', reviewStatus: 'APPROVED',
      person: {
        name: '张三', organizationName: '示例医院', phoneEncrypted: 'phone-cipher', idNumberEncrypted: 'id-cipher',
        email: 'zhang@example.com', department: '内科', position: '主任',
      },
      formOwner: { displayName: '李PM' }, reviewer: { displayName: '王复核' },
      allocations: [
        { allocatedAmount: '5000.00', bankTransaction: { transactionAt: new Date('2026-05-01T00:00:00.000Z') } },
      ],
    }]);
  });

  it('exports full expert sensitive values and records a sensitive audit event', async () => {
    const result = await service.export(ExportDataset.EXPERTS, { q: '张三', pmUserId: '00000000-0000-4000-8000-000000000001', paymentFrom: '2026-01-01', paymentTo: '2026-12-31' }, user as never);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const row = workbook.getWorksheet('专家库')!.getRow(2);

    expect(row.getCell(4).value).toBe('plain:phone-cipher');
    expect(row.getCell(5).value).toBe('plain:id-cipher');
    expect(row.getCell(7).value).toBe('plain:bank-cipher');
    expect(row.getCell(8).value).toBe('执业证.pdf');
    expect(row.getCell(14).value).toBe(1);
    expect(row.getCell(15).value).toBe(5000);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: user.id,
      action: 'EXPORT_SENSITIVE',
      afterData: expect.objectContaining({ rowCount: 1, filters: { q: '张三', pmUserId: '00000000-0000-4000-8000-000000000001', paymentFrom: '2026-01-01', paymentTo: '2026-12-31' } }),
    }));
  });

  it('rejects exports above the maximum row count', async () => {
    prisma.expertProfile.count.mockResolvedValue(20_001);

    await expect(service.export(ExportDataset.EXPERTS, {}, user as never)).rejects.toThrow(BadRequestException);
    expect(prisma.expertProfile.findMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
