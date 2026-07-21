import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  committees() {
    return this.prisma.committee.findMany({
      where: { status: 'ACTIVE' }, include: { owner: { select: { displayName: true } }, _count: { select: { memberships: true } } },
      orderBy: { establishedOn: 'desc' },
    });
  }

  async createCommittee(dto: CreateCommitteeDto, actorUserId: string) {
    await this.requireActivePm(dto.ownerUserId);
    const committee = await this.prisma.committee.create({
      data: { ...dto, establishedOn: new Date(dto.establishedOn) }, include: { owner: true },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'COMMITTEE', objectId: committee.id,
      afterData: { committeeCode: committee.committeeCode, name: committee.name },
    });
    return committee;
  }

  async updateCommittee(id: string, dto: UpdateCommitteeDto, actorUserId: string) {
    const before = await this.prisma.committee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专委会不存在');
    if (dto.ownerUserId) await this.requireActivePm(dto.ownerUserId);
    const committee = await this.prisma.committee.update({
      where: { id }, data: { ...dto, ...(dto.establishedOn ? { establishedOn: new Date(dto.establishedOn) } : {}) },
      include: { owner: { select: { id: true, displayName: true } }, _count: { select: { memberships: true } } },
    });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'COMMITTEE', objectId: id, beforeData: { name: before.name, status: before.status }, afterData: { name: committee.name, status: committee.status } });
    return committee;
  }

  async deactivateCommittee(id: string, actorUserId: string) {
    const before = await this.prisma.committee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专委会不存在');
    const committee = await this.prisma.committee.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'COMMITTEE', objectId: id, beforeData: { status: before.status }, afterData: { status: committee.status } });
    return committee;
  }

  async list(query: MembershipListQueryDto) {
    const where: Prisma.MembershipWhereInput = {
      ...(query.committeeId ? { committeeId: query.committeeId } : {}),
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
          dues: {
            include: { allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true, confirmedAt: true } } },
            orderBy: { dueOn: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        dues: item.dues.map((due) => ({
          ...due,
          amountPaid: due.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0).toFixed(2),
          lastPaidAt: due.allocations.map((allocation) => allocation.confirmedAt).filter(Boolean).sort().at(-1) ?? null,
        })),
      })),
      total,
    };
  }

  async createMembership(dto: CreateMembershipDto, actorUserId: string) {
    await Promise.all([this.requireActivePm(dto.pmUserId), this.requireActiveCommittee(dto.committeeId)]);
    const membership = await this.prisma.membership.create({
      data: { ...dto, joinedOn: dto.joinedOn ? new Date(dto.joinedOn) : null },
      include: { committee: true, pm: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'MEMBERSHIP', objectId: membership.id,
      afterData: { memberName: membership.memberName, committeeId: membership.committeeId },
    });
    return membership;
  }

  async updateMembership(id: string, dto: UpdateMembershipDto, actorUserId: string) {
    const before = await this.prisma.membership.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('会员不存在');
    if (dto.pmUserId) await this.requireActivePm(dto.pmUserId);
    if (dto.committeeId) await this.requireActiveCommittee(dto.committeeId);
    const membership = await this.prisma.membership.update({
      where: { id }, data: { ...dto, ...(dto.joinedOn ? { joinedOn: new Date(dto.joinedOn) } : {}) },
      include: { committee: true, pm: { select: { id: true, displayName: true } }, dues: true },
    });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'MEMBERSHIP', objectId: id, beforeData: { memberName: before.memberName, status: before.status }, afterData: { memberName: membership.memberName, status: membership.status } });
    return membership;
  }

  async deactivateMembership(id: string, actorUserId: string) {
    const before = await this.prisma.membership.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('会员不存在');
    const membership = await this.prisma.membership.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'MEMBERSHIP', objectId: id, beforeData: { status: before.status }, afterData: { status: membership.status } });
    return membership;
  }

  async createDue(dto: CreateMemberDueDto, actorUserId: string) {
    if (Number(dto.amountDue) <= 0) throw new BadRequestException('应收金额必须大于零');
    const membership = await this.prisma.membership.findFirst({ where: { id: dto.membershipId, status: 'ACTIVE' }, select: { id: true } });
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

  async updateDue(id: string, dto: UpdateMemberDueDto, actorUserId: string) {
    const before = await this.prisma.memberDue.findUnique({ where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } } });
    if (!before) throw new NotFoundException('会费应收不存在');
    if (before.allocations.length && dto.amountDue !== undefined) throw new BadRequestException('已有收款分配的会费不能修改应收金额');
    if (dto.amountDue !== undefined && Number(dto.amountDue) <= 0) throw new BadRequestException('应收金额必须大于零');
    const due = await this.prisma.memberDue.update({ where: { id }, data: { ...dto, ...(dto.dueOn ? { dueOn: new Date(dto.dueOn) } : {}) } });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'MEMBER_DUE', objectId: id, beforeData: { amountDue: before.amountDue.toString(), status: before.status }, afterData: { amountDue: due.amountDue.toString(), status: due.status } });
    return due;
  }

  async waiveDue(id: string, actorUserId: string) {
    const before = await this.prisma.memberDue.findUnique({ where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } } });
    if (!before) throw new NotFoundException('会费应收不存在');
    if (before.allocations.length) throw new BadRequestException('已有收款分配的会费不能删除');
    const due = await this.prisma.memberDue.update({ where: { id }, data: { status: 'WAIVED' } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'MEMBER_DUE', objectId: id, beforeData: { status: before.status }, afterData: { status: due.status } });
    return due;
  }

  dueOptions() {
    return this.prisma.memberDue.findMany({
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
      select: { id: true, dueCode: true, periodLabel: true, amountDue: true, membership: { include: { committee: true } } },
      orderBy: { dueOn: 'asc' },
    });
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.user.findFirst({ where: { id, role: 'PM', status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('负责 PM 不存在或已停用');
  }

  private async requireActiveCommittee(id: string) {
    const committee = await this.prisma.committee.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!committee) throw new NotFoundException('专委会不存在或已停用');
  }
}
