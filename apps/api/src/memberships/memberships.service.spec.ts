import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service';

describe('MembershipsService committee uniqueness', () => {
  const audit = { record: vi.fn() };
  const prisma = {
    projectManager: { findFirst: vi.fn(), findMany: vi.fn() },
    committee: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    membership: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    memberDue: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    bankAllocation: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const sensitive = {
    encrypt: vi.fn((value?: string) => value ? `encrypted:${value}` : undefined),
    hash: vi.fn((value?: string) => value ? `hash:${value}` : undefined),
    maskId: vi.fn((value?: string) => value ? `masked-id:${value.slice(-4)}` : undefined),
    maskPhone: vi.fn((value?: string) => value ? `masked-phone:${value.slice(-4)}` : undefined),
  };
  let service: MembershipsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MembershipsService(prisma as never, audit as never, sensitive as never);
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

  it('encrypts member identity and phone fields while storing searchable profile fields', async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.membership.create.mockResolvedValue({
      id: 'member-id', memberName: '测试会员', committeeId: null,
    });

    await service.createMembership({
      memberName: '测试会员', memberType: '个人会员', joinsCommittee: 'false', pmUserId: 'pm-id',
      organizationName: ' 示例医院 ', department: ' 呼吸科 ', idNumber: '310000199001011234',
      phone: '13800138000', email: ' member@example.com ',
    }, 'admin-id');

    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationName: '示例医院', department: '呼吸科', email: 'member@example.com',
        idNumberEncrypted: 'encrypted:310000199001011234', idNumberHash: 'hash:310000199001011234',
        idNumberMasked: 'masked-id:1234', phoneEncrypted: 'encrypted:13800138000', phoneMasked: 'masked-phone:8000',
      }),
    }));
  });

  it('returns cumulative receivable, received and invoiced membership totals', async () => {
    prisma.membership.findMany.mockReturnValue('members-query' as never);
    prisma.membership.count.mockReturnValue('count-query' as never);
    prisma.$transaction.mockResolvedValue([[
      { id: 'member-id', dues: [], _count: { dues: 2 } },
    ], 1]);
    prisma.memberDue.groupBy.mockResolvedValue([{ membershipId: 'member-id', _sum: { amountDue: '1800.00' } }]);
    prisma.bankAllocation.findMany.mockResolvedValue([
      { allocatedAmount: '800.00', memberDue: { membershipId: 'member-id' } },
      { allocatedAmount: '200.00', memberDue: { membershipId: 'member-id' } },
    ]);
    prisma.invoice.findMany.mockResolvedValue([
      { membershipId: 'member-id', totalAmount: '900.00', kind: 'BLUE' },
      { membershipId: 'member-id', totalAmount: '100.00', kind: 'RED' },
    ]);
    prisma.attachment.findMany.mockResolvedValue([]);

    await expect(service.list({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      total: 1,
      items: [{ feeSummary: { receivableAmount: '1800.00', receivedAmount: '1000.00', invoicedAmount: '800.00' } }],
    });
  });

  it('allows joining a committee without a position', async () => {
    prisma.committee.findFirst.mockResolvedValue({ id: 'committee-id' });
    prisma.membership.create.mockResolvedValue({
      id: 'member-id', memberName: '测试会员', committeeId: 'committee-id', memberPosition: null,
    });

    await service.createMembership({
      memberName: '测试会员', committeeId: 'committee-id', memberType: '个人会员', pmUserId: 'pm-id',
    }, 'admin-id');

    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ committeeId: 'committee-id', memberPosition: null, committeeMemberStatus: 'IN_OFFICE' }),
    }));
  });

  it('creates a member without a committee and clears committee-only fields', async () => {
    prisma.membership.create.mockResolvedValue({
      id: 'member-id', memberName: '普通会员', committeeId: null, committee: null,
    });

    await service.createMembership({
      memberName: '普通会员', memberType: '个人会员', joinsCommittee: 'false', pmUserId: 'pm-id',
    }, 'admin-id');

    expect(prisma.committee.findFirst).not.toHaveBeenCalled();
    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ committeeId: null, memberPosition: null, committeeMemberStatus: null, committeeTerm: null }),
    }));
  });

  it('updates both member material flags including false values', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'member-id', committeeId: 'committee-id' });
    prisma.membership.update.mockResolvedValue({ id: 'member-id', memberName: '测试会员', status: 'ACTIVE' });

    await service.updateMembership('member-id', {
      certificateIssued: 'false', appointmentLetterIssued: 'true',
    }, 'admin-id');

    expect(prisma.membership.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ certificateIssued: false, appointmentLetterIssued: true }),
    }));
  });

  it('clears committee details when status changes to not joined', async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: 'member-id', committeeId: 'committee-id', memberPosition: '委员', committeeMemberStatus: 'IN_OFFICE', committeeTerm: 2,
    });
    prisma.membership.update.mockResolvedValue({ id: 'member-id', memberName: '测试会员', committeeId: null });

    await service.updateMembership('member-id', { joinsCommittee: 'false' }, 'admin-id');

    expect(prisma.membership.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        committeeId: null, memberPosition: null, committeeMemberStatus: null, committeeTerm: null, appointmentLetterIssued: false,
      }),
    }));
  });

  it('clears position and term when committee status changes to left office', async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: 'member-id', committeeId: 'committee-id', memberPosition: '委员', committeeMemberStatus: 'IN_OFFICE', committeeTerm: 2,
    });
    prisma.committee.findFirst.mockResolvedValue({ id: 'committee-id' });
    prisma.membership.update.mockResolvedValue({ id: 'member-id', memberName: '测试会员', committeeMemberStatus: 'LEFT_OFFICE' });

    await service.updateMembership('member-id', { committeeMemberStatus: 'LEFT_OFFICE' }, 'admin-id');

    expect(prisma.membership.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ memberPosition: null, committeeMemberStatus: 'LEFT_OFFICE', committeeTerm: null }),
    }));
  });

  it('imports members and resolves active PM and committee names', async () => {
    prisma.projectManager.findMany.mockResolvedValue([{ id: 'pm-id', displayName: '张项目' }]);
    prisma.committee.findMany.mockResolvedValue([{ id: 'committee-id', committeeCode: 'C-001', name: '心血管专委会' }]);
    const create = vi.spyOn(service, 'createMembership').mockResolvedValue({ id: 'member-id' } as never);
    const csv = '会员名称,单位,科室,身份证号,手机号,邮箱,会员类别,负责PM,入会日期,是否加入专委会,所属专委会,委员职务,任职状态,届次\n张三,示例医院,呼吸科,310000199001011234,13800138000,zhang@example.com,个人会员,张项目,2026/8/18,是,心血管专委会,副主任委员,在任,12\n';
    const user = { id: 'admin-id', username: 'admin', displayName: '管理员', role: 'ADMIN', projectManagerId: null, projectIds: [], permissions: [] } as const;

    await expect(service.importMemberships({ buffer: Buffer.from(csv), originalname: 'members.csv' }, user as never)).resolves.toEqual({
      total: 1, successCount: 1, failureCount: 0, errors: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      memberName: '张三', organizationName: '示例医院', department: '呼吸科', idNumber: '310000199001011234', phone: '13800138000', email: 'zhang@example.com', pmUserId: 'pm-id', committeeId: 'committee-id', committeeMemberStatus: 'IN_OFFICE', committeeTerm: '12', joinedOn: '2026-08-18',
    }), 'admin-id', user);
  });
});
