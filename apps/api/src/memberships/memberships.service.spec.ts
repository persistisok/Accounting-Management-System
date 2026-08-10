import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service';

describe('MembershipsService committee uniqueness', () => {
  const audit = { record: vi.fn() };
  const prisma = {
    projectManager: { findFirst: vi.fn() },
    committee: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    membership: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    memberDue: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: MembershipsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MembershipsService(prisma as never, audit as never);
    prisma.projectManager.findFirst.mockResolvedValue({ id: 'pm-id' });
  });

  it('returns a clear conflict when the committee code already exists', async () => {
    prisma.committee.findFirst.mockResolvedValue({ committeeCode: 'C-001', name: '心血管专委会' });

    await expect(service.createCommittee({
      committeeCode: ' C-001 ', name: '新专委会', establishedOn: '2026-07-22', ownerUserId: 'pm-id',
    }, 'admin-id')).rejects.toThrow(new ConflictException('专委会编码“C-001”已存在'));
    expect(prisma.committee.create).not.toHaveBeenCalled();
  });

  it('returns a clear conflict when the committee name already exists', async () => {
    prisma.committee.findFirst.mockResolvedValue({ committeeCode: 'C-001', name: '心血管专委会' });

    await expect(service.createCommittee({
      committeeCode: 'C-002', name: '心血管专委会', establishedOn: '2026-07-22', ownerUserId: 'pm-id',
    }, 'admin-id')).rejects.toThrow(new ConflictException('专委会名称“心血管专委会”已存在'));
    expect(prisma.committee.create).not.toHaveBeenCalled();
  });

  it('searches and paginates active committees', async () => {
    prisma.committee.findMany.mockReturnValue('items-query');
    prisma.committee.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[{ id: 'committee-id' }], 1]);

    await expect(service.committees({ q: '呼吸', page: 2, pageSize: 6 })).resolves.toEqual({
      items: [{ id: 'committee-id' }], total: 1,
    });
    expect(prisma.committee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'ACTIVE', OR: expect.any(Array) }), skip: 6, take: 6,
    }));
  });

  it('returns every due for a member with pagination and paid totals', async () => {
    prisma.membership.findUnique.mockResolvedValue({ id: 'member-id' });
    prisma.memberDue.findMany.mockReturnValue('dues-query');
    prisma.memberDue.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[
      { id: 'due-2', amountDue: '200.00', allocations: [{ allocatedAmount: '80.00', confirmedAt: new Date('2026-07-20') }] },
      { id: 'due-1', amountDue: '100.00', allocations: [] },
    ], 4]);

    await expect(service.memberDues('member-id', { page: 2, pageSize: 2 })).resolves.toEqual({
      items: [
        expect.objectContaining({ id: 'due-2', amountPaid: '80.00' }),
        expect.objectContaining({ id: 'due-1', amountPaid: '0.00' }),
      ],
      total: 4,
    });
    expect(prisma.memberDue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { membershipId: 'member-id' }, skip: 2, take: 2,
    }));
  });

  it('returns searchable membership payment options with outstanding totals', async () => {
    prisma.membership.findMany.mockResolvedValue([{
      id: 'member-id', memberName: '测试会员', committee: { committeeCode: 'C-001', name: '测试专委会' },
      dues: [
        { amountDue: '100.00', allocations: [{ allocatedAmount: '40.00' }] },
        { amountDue: '200.00', allocations: [] },
      ],
    }]);

    await expect(service.paymentOptions()).resolves.toEqual([expect.objectContaining({
      id: 'member-id', memberName: '测试会员', outstandingAmount: '260.00', dueCount: 2,
    })]);
  });

  it('stores the manually entered position and certificate flag', async () => {
    prisma.committee.findFirst.mockResolvedValue({ id: 'committee-id' });
    prisma.membership.create.mockResolvedValue({
      id: 'member-id', memberName: '测试会员', committeeId: 'committee-id', certificateIssued: true,
    });

    await service.createMembership({
      memberName: '测试会员', committeeId: 'committee-id', memberType: '个人会员',
      memberPosition: '副主任委员', certificateIssued: 'true', pmUserId: 'pm-id', joinedOn: '2026-08-10',
    }, 'admin-id');

    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ memberPosition: '副主任委员', certificateIssued: true }),
    }));
  });
});
