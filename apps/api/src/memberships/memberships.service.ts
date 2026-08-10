import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CommitteeListQueryDto, CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async committees(query: CommitteeListQueryDto, user?: AuthUser) {
    const where: Prisma.CommitteeWhereInput = {
      status: 'ACTIVE',
      ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      ...(query.q ? { OR: [
        { committeeCode: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.committee.findMany({
        where,
        include: { owner: { select: { displayName: true } }, _count: { select: { memberships: true } } },
        orderBy: { establishedOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.committee.count({ where }),
    ]);
    return { items, total };
  }

  committeeOptions(user?: AuthUser) {
    return this.prisma.committee.findMany({
      where: { status: 'ACTIVE', ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
      select: { id: true, committeeCode: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCommittee(dto: CreateCommitteeDto, actorUserId: string, user?: AuthUser) {
    const ownerUserId = user?.role === 'PM' ? user.projectManagerId : dto.ownerUserId;
    if (!ownerUserId) throw new NotFoundException('PM 账号必须绑定 PM');
    const data = { ...dto, ownerUserId, committeeCode: dto.committeeCode.trim(), name: dto.name.trim() };
    await this.requireActivePm(ownerUserId);
    await this.requireUniqueCommittee(data.committeeCode, data.name);
    let committee;
    try {
      committee = await this.prisma.committee.create({
        data: { ...data, establishedOn: new Date(dto.establishedOn) }, include: { owner: true },
      });
    } catch (error) {
      this.rethrowCommitteeConflict(error, data.committeeCode, data.name);
    }
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'COMMITTEE', objectId: committee.id,
      afterData: { committeeCode: committee.committeeCode, name: committee.name },
    });
    return committee;
  }

  async updateCommittee(id: string, dto: UpdateCommitteeDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.committee.findFirst({ where: { id, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('专委会不存在');
    if (dto.ownerUserId) await this.requireActivePm(dto.ownerUserId);
    const committeeCode = dto.committeeCode?.trim() ?? before.committeeCode;
    const name = dto.name?.trim() ?? before.name;
    await this.requireUniqueCommittee(committeeCode, name, id);
    let committee;
    try {
      committee = await this.prisma.committee.update({
        where: { id }, data: { ...dto, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId! } : {}), committeeCode, name, ...(dto.establishedOn ? { establishedOn: new Date(dto.establishedOn) } : {}) },
        include: { owner: { select: { id: true, displayName: true } }, _count: { select: { memberships: true } } },
      });
    } catch (error) {
      this.rethrowCommitteeConflict(error, committeeCode, name);
    }
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'COMMITTEE', objectId: id, beforeData: { name: before.name, status: before.status }, afterData: { name: committee.name, status: committee.status } });
    return committee;
  }

  async deactivateCommittee(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.committee.findFirst({ where: { id, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('专委会不存在');
    const committee = await this.prisma.committee.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'COMMITTEE', objectId: id, beforeData: { status: before.status }, afterData: { status: committee.status } });
    return committee;
  }

  async list(query: MembershipListQueryDto, user?: AuthUser) {
    const where: Prisma.MembershipWhereInput = {
      ...(query.committeeId ? { committeeId: query.committeeId } : {}),
      ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      ...(query.q ? { OR: [
        { memberName: { contains: query.q, mode: 'insensitive' } },
        { committee: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: {
          committee: true,
          pm: { select: { id: true, displayName: true } },
          _count: { select: { dues: true } },
          dues: {
            include: { allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true, confirmedAt: true } } },
            orderBy: [{ dueOn: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'MEMBERSHIP', items.map((item) => item.id));
    return {
      items: items.map((item) => ({
        ...item,
        attachments: attachments[item.id] ?? [],
        dues: item.dues.map((due) => ({
          ...due,
          amountPaid: due.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0).toFixed(2),
          lastPaidAt: due.allocations.map((allocation) => allocation.confirmedAt).filter(Boolean).sort().at(-1) ?? null,
        })),
      })),
      total,
    };
  }

  async memberDues(membershipId: string, query: { page: number; pageSize: number }, user?: AuthUser) {
    const membership = user?.role === 'PM'
      ? await this.prisma.membership.findFirst({ where: { id: membershipId, pmUserId: user.projectManagerId ?? '__unbound_pm__' }, select: { id: true } })
      : await this.prisma.membership.findUnique({ where: { id: membershipId }, select: { id: true } });
    if (!membership) throw new NotFoundException('会员不存在');
    const where: Prisma.MemberDueWhereInput = { membershipId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.memberDue.findMany({
        where,
        include: { allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true, confirmedAt: true } } },
        orderBy: [{ dueOn: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.memberDue.count({ where }),
    ]);
    return {
      items: items.map((due) => ({
        ...due,
        amountPaid: due.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0).toFixed(2),
        lastPaidAt: due.allocations.map((allocation) => allocation.confirmedAt).filter(Boolean).sort().at(-1) ?? null,
      })),
      total,
    };
  }

  async createMembership(dto: CreateMembershipDto, actorUserId: string, user?: AuthUser) {
    const pmUserId = user?.role === 'PM' ? user.projectManagerId : dto.pmUserId;
    if (!pmUserId) throw new NotFoundException('PM 账号必须绑定 PM');
    await Promise.all([this.requireActivePm(pmUserId), this.requireActiveCommittee(dto.committeeId, user)]);
    const { joinedOn, certificateIssued, ...membershipData } = dto;
    const membership = await this.prisma.membership.create({
      data: { ...membershipData, pmUserId, certificateIssued: certificateIssued === 'true', joinedOn: joinedOn ? new Date(joinedOn) : null },
      include: { committee: true, pm: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'MEMBERSHIP', objectId: membership.id,
      afterData: { memberName: membership.memberName, committeeId: membership.committeeId },
    });
    return membership;
  }

  async updateMembership(id: string, dto: UpdateMembershipDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.membership.findFirst({ where: { id, ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('会员不存在');
    if (dto.pmUserId) await this.requireActivePm(dto.pmUserId);
    if (dto.committeeId) await this.requireActiveCommittee(dto.committeeId, user);
    const { joinedOn, certificateIssued, ...membershipData } = dto;
    const membership = await this.prisma.membership.update({
      where: { id }, data: { ...membershipData, ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId! } : {}), ...(joinedOn ? { joinedOn: new Date(joinedOn) } : {}), ...(certificateIssued !== undefined ? { certificateIssued: certificateIssued === 'true' } : {}) },
      include: { committee: true, pm: { select: { id: true, displayName: true } }, dues: true },
    });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'MEMBERSHIP', objectId: id, beforeData: { memberName: before.memberName, status: before.status }, afterData: { memberName: membership.memberName, status: membership.status } });
    return membership;
  }

  async deactivateMembership(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.membership.findFirst({ where: { id, ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('会员不存在');
    const membership = await this.prisma.membership.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'MEMBERSHIP', objectId: id, beforeData: { status: before.status }, afterData: { status: membership.status } });
    return membership;
  }

  async createDue(dto: CreateMemberDueDto, actorUserId: string, user?: AuthUser) {
    if (Number(dto.amountDue) <= 0) throw new BadRequestException('应收金额必须大于零');
    const membership = await this.prisma.membership.findFirst({ where: { id: dto.membershipId, status: 'ACTIVE', ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) }, select: { id: true } });
    if (!membership) throw new NotFoundException('会员不存在或已停用');
    const due = await this.prisma.memberDue.create({
      data: { ...dto, dueOn: dto.dueOn ? new Date(dto.dueOn) : null }, include: { membership: true },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'MEMBER_DUE', objectId: due.id,
      afterData: { dueCode: due.dueCode, amountDue: due.amountDue.toString() },
    });
    return due;
  }

  async updateDue(id: string, dto: UpdateMemberDueDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.memberDue.findFirst({ where: { id, ...(user?.role === 'PM' ? { membership: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}) }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } } });
    if (!before) throw new NotFoundException('会费应收不存在');
    if (before.allocations.length && dto.amountDue !== undefined) throw new BadRequestException('已有收款分配的会费不能修改应收金额');
    if (dto.amountDue !== undefined && Number(dto.amountDue) <= 0) throw new BadRequestException('应收金额必须大于零');
    const due = await this.prisma.memberDue.update({ where: { id }, data: { ...dto, ...(dto.dueOn ? { dueOn: new Date(dto.dueOn) } : {}) } });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'MEMBER_DUE', objectId: id, beforeData: { amountDue: before.amountDue.toString(), status: before.status }, afterData: { amountDue: due.amountDue.toString(), status: due.status } });
    return due;
  }

  async waiveDue(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.memberDue.findFirst({ where: { id, ...(user?.role === 'PM' ? { membership: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}) }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } } });
    if (!before) throw new NotFoundException('会费应收不存在');
    if (before.allocations.length) throw new BadRequestException('已有收款分配的会费不能删除');
    const due = await this.prisma.memberDue.update({ where: { id }, data: { status: 'WAIVED' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'MEMBER_DUE', objectId: id, beforeData: { status: before.status }, afterData: { status: due.status } });
    return due;
  }

  dueOptions(user?: AuthUser) {
    return this.prisma.memberDue.findMany({
      where: { status: { in: ['UNPAID', 'PARTIAL'] }, ...(user?.role === 'PM' ? { membership: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}) },
      select: { id: true, dueCode: true, periodLabel: true, amountDue: true, membership: { include: { committee: true } } },
      orderBy: { dueOn: 'asc' },
    });
  }

  async paymentOptions(user?: AuthUser) {
    const memberships = await this.prisma.membership.findMany({
      where: { status: 'ACTIVE', ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
      select: {
        id: true, memberName: true,
        committee: { select: { committeeCode: true, name: true } },
        dues: {
          where: { status: { in: ['UNPAID', 'PARTIAL'] } },
          select: { amountDue: true, allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true } } },
        },
      },
      orderBy: { memberName: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.id,
      memberName: membership.memberName,
      committee: membership.committee,
      outstandingAmount: membership.dues.reduce((total, due) => {
        const paid = due.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
        return total + Math.max(0, Number(due.amountDue) - paid);
      }, 0).toFixed(2),
      dueCount: membership.dues.length,
    }));
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.projectManager.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('负责 PM 不存在或已停用');
  }

  private async requireActiveCommittee(id: string, user?: AuthUser) {
    const committee = await this.prisma.committee.findFirst({ where: { id, status: 'ACTIVE', ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) }, select: { id: true } });
    if (!committee) throw new NotFoundException('专委会不存在或已停用');
  }

  private async requireUniqueCommittee(committeeCode: string, name: string, excludeId?: string) {
    const duplicate = await this.prisma.committee.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { committeeCode },
          { name: { equals: name, mode: 'insensitive' } },
        ],
      },
      select: { committeeCode: true, name: true },
    });
    if (!duplicate) return;
    if (duplicate.committeeCode === committeeCode) throw new ConflictException(`专委会编码“${committeeCode}”已存在`);
    throw new ConflictException(`专委会名称“${name}”已存在`);
  }

  private rethrowCommitteeConflict(error: unknown, committeeCode: string, name: string): never {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    if (target.some((field) => field.includes('name'))) throw new ConflictException(`专委会名称“${name}”已存在`);
    throw new ConflictException(`专委会编码“${committeeCode}”已存在`);
  }
}
