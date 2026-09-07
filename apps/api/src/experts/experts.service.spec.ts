import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpertsService } from './experts.service';

describe('ExpertsService responsibility fields', () => {
  const audit = { record: vi.fn() };
  const sensitive = {
    hash: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    maskPhone: vi.fn(),
    maskId: vi.fn(),
    maskBank: vi.fn(),
  };
  const prisma = {
    projectManager: { findFirst: vi.fn(), findMany: vi.fn() },
    person: { findUnique: vi.fn(), findFirst: vi.fn() },
    expertProfile: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  let service: ExpertsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExpertsService(prisma as never, sensitive as never, audit as never);
  });

  it('connects the selected active PM as form owner', async () => {
    prisma.projectManager.findFirst.mockResolvedValue({ id: 'pm-id' });
    sensitive.hash.mockReturnValue(undefined);
    prisma.expertProfile.create.mockResolvedValue({
      id: 'expert-id', person: { name: '测试专家' }, reviewStatus: 'PENDING', formOwner: { displayName: '项目经理' },
    });

    await service.create({ name: '测试专家', formOwnerId: 'pm-id' }, 'admin-id');

    expect(prisma.projectManager.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pm-id', status: 'ACTIVE' } }));
    expect(prisma.expertProfile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ formOwner: { connect: { id: 'pm-id' } } }),
    }));
  });

  it('records the authenticated reviewer instead of accepting a reviewer id', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({ id: 'expert-id', reviewStatus: 'PENDING', status: 'ACTIVE' });
    prisma.expertProfile.update.mockResolvedValue({
      id: 'expert-id', reviewStatus: 'APPROVED', status: 'ACTIVE', person: { name: '测试专家' }, reviewer: { displayName: '复核员' },
    });

    await service.review('expert-id', { reviewStatus: 'APPROVED' }, 'reviewer-id');

    expect(prisma.expertProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { reviewStatus: 'APPROVED', reviewerId: 'reviewer-id', status: 'ACTIVE' },
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'reviewer-id' }));
  });

  it('moves a rejected pending expert directly to inactive', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({ id: 'expert-id', reviewStatus: 'PENDING', status: 'ACTIVE' });
    prisma.expertProfile.update.mockResolvedValue({
      id: 'expert-id', reviewStatus: 'REJECTED', status: 'INACTIVE', person: { name: '测试专家' }, reviewer: { displayName: '复核员' },
    });

    await service.review('expert-id', { reviewStatus: 'REJECTED' }, 'reviewer-id');

    expect(prisma.expertProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { reviewStatus: 'REJECTED', reviewerId: 'reviewer-id', status: 'INACTIVE' },
    }));
  });

  it('rejects review operations when the expert is not pending', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({ id: 'expert-id', reviewStatus: 'APPROVED', status: 'ACTIVE' });

    await expect(service.review('expert-id', { reviewStatus: 'REJECTED' }, 'reviewer-id')).rejects.toThrow('只有待复核专家');
    expect(prisma.expertProfile.update).not.toHaveBeenCalled();
  });

  it('allows deactivation only after approval', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({ id: 'expert-id', reviewStatus: 'PENDING', status: 'ACTIVE' });

    await expect(service.deactivate('expert-id', 'admin-id')).rejects.toThrow('只有已通过专家');
    expect(prisma.expertProfile.update).not.toHaveBeenCalled();
  });

  it('allows an approved active expert to be edited', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({
      id: 'expert-id', personId: 'person-id', reviewStatus: 'APPROVED', status: 'ACTIVE', person: { name: '原姓名' },
    });
    prisma.expertProfile.update.mockResolvedValue({
      id: 'expert-id', reviewStatus: 'APPROVED', status: 'ACTIVE', person: { name: '新姓名' }, formOwner: { displayName: '项目经理' },
    });

    await service.update('expert-id', { name: '新姓名' }, 'admin-id');

    expect(prisma.expertProfile.update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', objectId: 'expert-id' }));
  });

  it('decrypts active expert details and records sensitive access without plaintext', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({
      id: 'expert-id', status: 'ACTIVE', bankAccountEncrypted: 'bank-cipher',
      person: { name: '测试专家', phoneEncrypted: 'phone-cipher', idNumberEncrypted: 'id-cipher' },
    });
    sensitive.decrypt.mockImplementation((value: string) => ({
      'phone-cipher': '13800138000', 'id-cipher': '110101199001011234', 'bank-cipher': '6222000012345678',
    })[value]);

    await expect(service.sensitiveDetails('expert-id', 'admin-id')).resolves.toEqual({
      name: '测试专家', phone: '13800138000', idNumber: '110101199001011234', bankAccount: '6222000012345678', unavailableFields: [],
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin-id', action: 'VIEW_SENSITIVE', objectType: 'EXPERT',
      afterData: { fields: ['phone', 'idNumber', 'bankAccount'], unavailableFields: [] },
    }));
  });

  it('does not reveal sensitive details for an inactive expert', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({
      id: 'expert-id', status: 'INACTIVE', bankAccountEncrypted: 'bank-cipher',
      person: { name: '测试专家', phoneEncrypted: 'phone-cipher', idNumberEncrypted: 'id-cipher' },
    });

    await expect(service.sensitiveDetails('expert-id', 'admin-id')).rejects.toThrow('已停用专家不能查看敏感信息');
    expect(sensitive.decrypt).not.toHaveBeenCalled();
  });

  it('marks legacy encrypted fields for re-entry instead of failing the request', async () => {
    prisma.expertProfile.findUnique.mockResolvedValue({
      id: 'expert-id', status: 'ACTIVE', bankAccountEncrypted: 'legacy-bank',
      person: { name: '历史专家', phoneEncrypted: 'legacy-phone', idNumberEncrypted: 'legacy-id' },
    });
    sensitive.decrypt.mockImplementation(() => { throw new Error('invalid ciphertext'); });

    await expect(service.sensitiveDetails('expert-id', 'admin-id')).resolves.toEqual({
      name: '历史专家', phone: undefined, idNumber: undefined, bankAccount: undefined,
      unavailableFields: ['phone', 'idNumber', 'bankAccount'],
    });
  });

  it('returns only expert payment details and audits bank account access', async () => {
    prisma.expertProfile.findFirst.mockResolvedValue({
      id: 'expert-id', bankName: '测试银行', bankAccountEncrypted: 'bank-cipher', person: { name: '测试专家' },
    });
    sensitive.decrypt.mockReturnValue('6222000012345678');

    await expect(service.paymentDetails('expert-id', 'finance-id')).resolves.toEqual({
      name: '测试专家', bankName: '测试银行', bankAccount: '6222000012345678',
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'finance-id', action: 'VIEW_SENSITIVE', afterData: { fields: ['bankName', 'bankAccount'], unavailableFields: [] },
    }));
  });

  it('imports CSV rows in the expert form order and resolves PM by name', async () => {
    prisma.projectManager.findMany.mockResolvedValue([{ id: 'pm-id', displayName: '张项目' }]);
    const create = vi.spyOn(service, 'create').mockResolvedValue({ id: 'expert-id' } as never);
    const content = '\uFEFF姓名,单位,职称,职务,专业/科室,邮箱,手机,身份证号码,开户行,银行账号,入库时间,对接PM\r\n张三,示例医院,主任医师,科室主任,心内科,zhang@example.com,13800138000,310101199001011234,中国银行,62220000,2026/8/18,张项目\r\n';
    const user = { id: 'admin-id', username: 'admin', displayName: '管理员', role: 'ADMIN', projectManagerId: null, projectIds: [], permissions: [] } as const;

    await expect(service.importExperts({ buffer: Buffer.from(content), originalname: 'experts.csv' }, user as never)).resolves.toEqual({
      total: 1, successCount: 1, failureCount: 0, errors: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: '张三', organizationName: '示例医院', professionalTitle: '主任医师', position: '科室主任',
      department: '心内科', joinedOn: '2026-08-18', formOwnerId: 'pm-id',
    }), 'admin-id', user);
  });

  it('reports row errors and continues importing later expert rows', async () => {
    prisma.projectManager.findMany.mockResolvedValue([{ id: 'pm-id', displayName: '张项目' }]);
    const create = vi.spyOn(service, 'create').mockResolvedValue({ id: 'expert-id' } as never);
    const content = '姓名,单位,职称,职务,专业/科室,邮箱,手机,身份证号码,开户行,银行账号,入库时间,对接PM\n错误专家,,,,,not-an-email,,,,,,张项目\n正确专家,,,,,,,,,,,张项目\n';
    const user = { id: 'admin-id', username: 'admin', displayName: '管理员', role: 'ADMIN', projectManagerId: null, projectIds: [], permissions: [] } as const;

    const result = await service.importExperts({ buffer: Buffer.from(content), originalname: 'experts.csv' }, user as never);

    expect(result).toEqual({ total: 2, successCount: 1, failureCount: 1, errors: [{ row: 2, message: '邮箱格式不正确' }] });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: '正确专家' }), 'admin-id', user);
  });

  it('filters by PM and returns expert fee statistics from the selected start date', async () => {
    const item = {
      id: 'expert-id', professionalTitle: '主任医师', bankName: '测试银行', bankAccountMasked: '6222****1234',
      joinedOn: new Date('2025-01-01'), reviewStatus: 'APPROVED', status: 'ACTIVE', createdAt: new Date(),
      person: { id: 'person-id', name: '测试专家', phoneMasked: null, idNumberMasked: null, email: null, organizationName: '测试医院', department: '内科', position: null },
      formOwner: { id: 'pm-id', displayName: '张项目' }, reviewer: null,
    };
    const listPrisma = {
      expertProfile: { findMany: vi.fn(), count: vi.fn() },
      attachment: { findMany: vi.fn().mockResolvedValue([]) },
      bankAllocation: { groupBy: vi.fn().mockResolvedValue([{ expertProfileId: 'expert-id', _count: { _all: 3 }, _sum: { allocatedAmount: { toFixed: () => '6800.00' } } }]) },
      $transaction: vi.fn().mockResolvedValue([[item], 1]),
    };
    const listService = new ExpertsService(listPrisma as never, sensitive as never, audit as never);

    const result = await listService.list({ q: '测试专家', pmUserId: '00000000-0000-4000-8000-000000000001', paymentFrom: '2026-01-01', paymentTo: '2026-06-30', page: 1, pageSize: 20 });

    expect(listPrisma.expertProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        formOwnerId: '00000000-0000-4000-8000-000000000001',
        person: { name: { contains: '测试专家', mode: 'insensitive' } },
      }),
    }));
    expect(listPrisma.bankAllocation.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        category: 'EXPERT_FEE', status: 'CONFIRMED',
        bankTransaction: { transactionAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-06-30T00:00:00.000Z') } },
      }),
    }));
    expect(result).toMatchObject({ total: 1, paymentFrom: '2026-01-01', paymentTo: '2026-06-30', items: [{ id: 'expert-id', paymentCount: 3, paymentAmount: '6800.00' }] });
  });

  it('rejects an expert fee range whose end date is before its start date', async () => {
    const listService = new ExpertsService({} as never, sensitive as never, audit as never);
    await expect(listService.list({ page: 1, pageSize: 20, paymentFrom: '2026-07-01', paymentTo: '2026-06-30' }))
      .rejects.toThrow('结束日期不能早于起始日期');
  });
});
