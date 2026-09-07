import { describe, expect, it, vi } from 'vitest';
import { normalizeCapabilityName, normalizeOrganizationName, normalizeOrganizationPlatform, OrganizationsService } from './organizations.service';

describe('normalizeOrganizationName', () => {
  it('normalizes spaces and bracket variants for duplicate checks', () => {
    expect(normalizeOrganizationName('远川（上海） 医学中心')).toBe(normalizeOrganizationName('远川(上海)医学中心'));
  });
});

describe('organization duplicate key', () => {
  it('normalizes platform and name independently for combined duplicate checks', () => {
    expect(normalizeOrganizationPlatform(' 公益 合作平台 ')).toBe('公益合作平台');
    expect(`${normalizeOrganizationPlatform('平台 A')}:${normalizeOrganizationName('某机构')}`)
      .not.toBe(`${normalizeOrganizationPlatform('平台 B')}:${normalizeOrganizationName('某机构')}`);
  });

  it('checks duplicates by normalized platform and normalized name together', async () => {
    const prisma = {
      projectManager: { findFirst: vi.fn().mockResolvedValue({ id: 'pm-1' }) },
      organization: { findFirst: vi.fn().mockResolvedValue({
        id: 'organization-1', name: '某机构', ownerUserId: 'pm-1', roles: [{ roleType: 'SUPPORTER' }],
      }) },
    };
    const service = new OrganizationsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.create({
      name: ' 某 机构 ', platform: ' 平台 A ', ownerUserId: 'pm-1', roleType: 'SUPPORTER', joinedOn: '2026-08-10',
    }, 'admin-1')).rejects.toThrow('已存在于该资料库');
    expect(prisma.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { normalizedName: '某机构', normalizedPlatform: '平台a' },
    }));
  });
});

describe('executor organization rules', () => {
  it('checks executor duplicates by supplier name across platforms', async () => {
    const prisma = {
      projectManager: { findFirst: vi.fn().mockResolvedValue({ id: 'pm-1' }) },
      organization: { findFirst: vi.fn().mockResolvedValue({
        id: 'organization-1', name: '某供应商', ownerUserId: 'pm-1', roles: [{ roleType: 'EXECUTOR' }],
      }) },
    };
    const service = new OrganizationsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.create({ name: '某 供应商', ownerUserId: 'pm-1', roleType: 'EXECUTOR' }, 'admin-1'))
      .rejects.toThrow('已存在于该资料库');
    expect(prisma.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { normalizedName: '某供应商', roles: { some: { roleType: 'EXECUTOR' } } },
    }));
  });

  it('normalizes service capability names for duplicate checks', () => {
    expect(normalizeCapabilityName(' 现场 直播 ')).toBe(normalizeCapabilityName('现场直播'));
  });

  it('requires a note when the selected capability is other', async () => {
    const otherId = '10000000-0000-4000-8000-000000000012';
    const prisma = {
      projectManager: { findFirst: vi.fn().mockResolvedValue({ id: 'pm-1' }) },
      organization: { findFirst: vi.fn().mockResolvedValue(null) },
      serviceCapability: { findMany: vi.fn().mockResolvedValue([{ id: otherId, isOther: true, status: 'ACTIVE' }]) },
    };
    const service = new OrganizationsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.create({
      name: '某供应商', ownerUserId: 'pm-1', roleType: 'EXECUTOR', serviceCapabilityIds: [otherId],
    }, 'admin-1')).rejects.toThrow('必须填写服务能力备注');
  });

  it('persists the complete service capability display order', async () => {
    const firstId = '10000000-0000-4000-8000-000000000001';
    const secondId = '10000000-0000-4000-8000-000000000002';
    const update = vi.fn().mockResolvedValue({});
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: firstId }, { id: secondId }])
      .mockResolvedValueOnce([
        { id: secondId, sortOrder: 10 },
        { id: firstId, sortOrder: 20 },
      ]);
    const prisma = {
      serviceCapability: { findMany, update },
      $transaction: vi.fn().mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const audit = { record: vi.fn().mockResolvedValue({}) };
    const service = new OrganizationsService(prisma as never, audit as never);

    const result = await service.reorderServiceCapabilities({ ids: [secondId, firstId] }, 'admin-1');

    expect(update).toHaveBeenNthCalledWith(1, { where: { id: secondId }, data: { sortOrder: 10 } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: firstId }, data: { sortOrder: 20 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REORDER', objectType: 'SERVICE_CAPABILITY' }));
    expect(result).toEqual([
      { id: secondId, sortOrder: 10 },
      { id: firstId, sortOrder: 20 },
    ]);
  });

  it('rejects stale service capability order submissions', async () => {
    const prisma = {
      serviceCapability: { findMany: vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000001' }]) },
    };
    const service = new OrganizationsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.reorderServiceCapabilities({ ids: ['10000000-0000-4000-8000-000000000002'] }, 'admin-1'))
      .rejects.toThrow('服务能力列表已发生变化');
  });
});
