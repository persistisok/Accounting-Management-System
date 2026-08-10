import { describe, expect, it, vi } from 'vitest';
import { normalizeOrganizationName, normalizeOrganizationPlatform, OrganizationsService } from './organizations.service';

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
