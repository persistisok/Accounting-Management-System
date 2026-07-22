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
    projectManager: { findFirst: vi.fn() },
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
});
