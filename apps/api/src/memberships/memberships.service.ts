import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { normalizeImportDate, parseCsv } from '../common/csv-import';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CommitteeListQueryDto, CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';

const MEMBERSHIP_IMPORT_HEADERS = ['会员名称', '单位', '科室', '身份证号', '手机号', '邮箱', '会员类别', '负责PM', '入会日期', '是否加入专委会', '所属专委会', '委员职务', '任职状态', '届次'] as const;

export interface MembershipImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
}

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly sensitive: SensitiveDataService) {}

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

  importTemplate() {
    const example = ['张三', '示例医院', '呼吸科', '310000199001011234', '13800138000', 'zhang@example.com', '个人会员', '张项目', '2026/08/18', '是', '心血管专委会', '副主任委员', '在任', '12'];
    return Buffer.from(`\uFEFF${MEMBERSHIP_IMPORT_HEADERS.join(',')}\r\n${example.join(',')}\r\n`, 'utf8');
  }

  async importMemberships(file: { buffer: Buffer; originalname: string }, user: AuthUser): Promise<MembershipImportResult> {
    if (!file.originalname.toLowerCase().endsWith('.csv')) throw new BadRequestException('仅支持 CSV 格式的会员导入文件');
    const rows = parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, '')).filter((row) => row.some((cell) => cell.trim()));
    if (!rows.length) throw new BadRequestException('CSV 文件为空');
    const headers = rows[0]!.map((header) => header.trim());
    if (headers.length !== MEMBERSHIP_IMPORT_HEADERS.length || MEMBERSHIP_IMPORT_HEADERS.some((header, index) => headers[index] !== header)) {
      throw new BadRequestException(`CSV 表头应为：${MEMBERSHIP_IMPORT_HEADERS.join('、')}`);
    }
    const dataRows = rows.slice(1);
    if (!dataRows.length) throw new BadRequestException('CSV 文件没有可导入的数据');
    if (dataRows.length > 1000) throw new BadRequestException('单次最多导入 1000 位会员');

    const [activePms, activeCommittees] = await Promise.all([
      this.prisma.projectManager.findMany({ where: { status: 'ACTIVE' }, select: { id: true, displayName: true } }),
      this.prisma.committee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, committeeCode: true, name: true } }),
    ]);
    const pmByName = new Map<string, Array<{ id: string }>>();
    for (const pm of activePms) pmByName.set(pm.displayName.trim(), [...(pmByName.get(pm.displayName.trim()) ?? []), pm]);
    const committeeByKey = new Map<string, { id: string }>();
    for (const committee of activeCommittees) {
      committeeByKey.set(committee.committeeCode.trim().toLocaleLowerCase('zh-CN'), committee);
      committeeByKey.set(committee.name.trim().toLocaleLowerCase('zh-CN'), committee);
    }

    let successCount = 0;
    const errors: MembershipImportResult['errors'] = [];
    for (let index = 0; index < dataRows.length; index += 1) {
      const rowNumber = index + 2;
      const cells = dataRows[index]!.map((cell) => cell.trim());
      try {
        if (cells.length > MEMBERSHIP_IMPORT_HEADERS.length) throw new BadRequestException('列数超过模板定义，请检查逗号或引号');
        const [memberName, organizationName, department, idNumber, phone, email, memberType, pmName, joinedOn, joinsCommitteeText, committeeText, memberPosition, committeeStatusText, committeeTerm] = cells;
        if (!memberName) throw new BadRequestException('会员名称不能为空');
        if (!memberType) throw new BadRequestException('会员类别不能为空');
        if (memberName.length > 200) throw new BadRequestException('会员名称不能超过 200 个字符');
        if (memberType.length > 50) throw new BadRequestException('会员类别不能超过 50 个字符');
        if (memberPosition && memberPosition.length > 50) throw new BadRequestException('委员职务不能超过 50 个字符');
        if (!joinsCommitteeText || !['是', '否'].includes(joinsCommitteeText)) throw new BadRequestException('是否加入专委会只能填写“是”或“否”');
        const joinsCommittee = joinsCommitteeText === '是';

        let pmUserId = user.role === 'PM' ? user.projectManagerId : undefined;
        if (user.role !== 'PM') {
          if (!pmName) throw new BadRequestException('负责 PM 不能为空');
          const matches = pmByName.get(pmName) ?? [];
          if (!matches.length) throw new BadRequestException(`未找到在职 PM“${pmName}”`);
          if (matches.length > 1) throw new BadRequestException(`PM 姓名“${pmName}”重复，无法唯一匹配`);
          pmUserId = matches[0]!.id;
        }
        if (!pmUserId) throw new BadRequestException('当前 PM 账号未绑定 PM');

        let committeeId: string | undefined;
        if (joinsCommittee) {
          if (!committeeText) throw new BadRequestException('加入专委会时所属专委会不能为空');
          committeeId = committeeByKey.get(committeeText.toLocaleLowerCase('zh-CN'))?.id;
          if (!committeeId) throw new BadRequestException(`未找到启用专委会“${committeeText}”`);
          if (committeeStatusText && !['在任', '离任'].includes(committeeStatusText)) throw new BadRequestException('任职状态只能填写“在任”或“离任”');
          if (committeeTerm && (!/^\d+$/.test(committeeTerm) || Number(committeeTerm) <= 0)) throw new BadRequestException('届次必须为大于 0 的整数');
        }

        await this.createMembership({
          memberName, organizationName, department, idNumber, phone, email, memberType, pmUserId, joinsCommittee: String(joinsCommittee), committeeId,
          joinedOn: joinedOn ? normalizeImportDate(joinedOn, '入会日期') : undefined,
          memberPosition: joinsCommittee ? memberPosition : undefined,
          committeeMemberStatus: joinsCommittee ? (committeeStatusText === '离任' ? 'LEFT_OFFICE' : 'IN_OFFICE') : undefined,
          committeeTerm: joinsCommittee && committeeTerm ? committeeTerm : undefined,
        }, user.id, user);
        successCount += 1;
      } catch (error) {
        const response = error && typeof error === 'object' && 'getResponse' in error
          ? (error as { getResponse: () => string | { message?: string | string[] } }).getResponse()
          : undefined;
        const message = typeof response === 'string' ? response : Array.isArray(response?.message) ? response.message.join('；') : response?.message;
        errors.push({ row: rowNumber, message: message ?? (error instanceof Error ? error.message : '导入失败') });
      }
    }
    return { total: dataRows.length, successCount, failureCount: errors.length, errors };
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
        { organizationName: { contains: query.q, mode: 'insensitive' } },
        { department: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
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
    const membershipIds = items.map((item) => item.id);
    const [dueTotals, paidAllocations, invoicedTickets] = membershipIds.length ? await Promise.all([
      this.prisma.memberDue.groupBy({
        by: ['membershipId'],
        where: { membershipId: { in: membershipIds }, status: { not: 'WAIVED' } },
        _sum: { amountDue: true },
      }),
      this.prisma.bankAllocation.findMany({
        where: { status: 'CONFIRMED', memberDue: { membershipId: { in: membershipIds } } },
        select: { allocatedAmount: true, memberDue: { select: { membershipId: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { membershipId: { in: membershipIds }, category: 'MEMBER_DUE_ISSUED', collectionStatus: 'COLLECTED', status: 'NORMAL' },
        select: { membershipId: true, totalAmount: true, kind: true },
      }),
    ]) : [[], [], []];
    const feeSummary = new Map<string, { receivable: number; received: number; invoiced: number }>();
    for (const id of membershipIds) feeSummary.set(id, { receivable: 0, received: 0, invoiced: 0 });
    for (const due of dueTotals) feeSummary.get(due.membershipId)!.receivable += Number(due._sum.amountDue ?? 0);
    for (const allocation of paidAllocations) feeSummary.get(allocation.memberDue!.membershipId)!.received += Number(allocation.allocatedAmount);
    for (const ticket of invoicedTickets) {
      if (!ticket.membershipId) continue;
      feeSummary.get(ticket.membershipId)!.invoiced += Number(ticket.totalAmount) * (ticket.kind === 'RED' ? -1 : 1);
    }
    const attachments = await attachmentMap(this.prisma, 'MEMBERSHIP', items.map((item) => item.id));
    return {
      items: items.map((item) => ({
        ...item,
        attachments: attachments[item.id] ?? [],
        feeSummary: {
          receivableAmount: (feeSummary.get(item.id)?.receivable ?? 0).toFixed(2),
          receivedAmount: (feeSummary.get(item.id)?.received ?? 0).toFixed(2),
          invoicedAmount: (feeSummary.get(item.id)?.invoiced ?? 0).toFixed(2),
        },
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
    const joinsCommittee = dto.joinsCommittee === 'true' || Boolean(dto.committeeId);
    await this.requireActivePm(pmUserId);
    if (joinsCommittee) {
      if (!dto.committeeId) throw new BadRequestException('加入专委会时必须选择所属专委会');
      await this.requireActiveCommittee(dto.committeeId, user);
    }
    const committeeMemberStatus = joinsCommittee ? dto.committeeMemberStatus ?? 'IN_OFFICE' : null;
    const isFormerCommitteeMember = committeeMemberStatus === 'LEFT_OFFICE';
    if (dto.idNumber) await this.requireUniqueMemberIdNumber(dto.idNumber);
    const {
      joinedOn, certificateIssued, appointmentLetterIssued, committeeTerm, joinsCommittee: _joinsCommittee,
      idNumber, phone, organizationName, department, email, ...membershipData
    } = dto;
    const membership = await this.prisma.membership.create({
      data: {
        ...membershipData, pmUserId,
        organizationName: organizationName?.trim() || null,
        department: department?.trim() || null,
        idNumberEncrypted: this.sensitive.encrypt(idNumber?.trim()),
        idNumberHash: this.sensitive.hash(idNumber?.trim()),
        idNumberMasked: this.sensitive.maskId(idNumber?.trim()),
        phoneEncrypted: this.sensitive.encrypt(phone?.trim()),
        phoneMasked: this.sensitive.maskPhone(phone?.trim()),
        email: email?.trim() || null,
        committeeId: joinsCommittee ? dto.committeeId : null,
        memberPosition: joinsCommittee && !isFormerCommitteeMember ? dto.memberPosition?.trim() || null : null,
        committeeMemberStatus,
        committeeTerm: joinsCommittee && !isFormerCommitteeMember && committeeTerm ? Number(committeeTerm) : null,
        certificateIssued: certificateIssued === 'true',
        appointmentLetterIssued: joinsCommittee && appointmentLetterIssued === 'true',
        joinedOn: joinedOn ? new Date(joinedOn) : null,
      },
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
    const joinsCommittee = dto.joinsCommittee === undefined ? Boolean(before.committeeId) : dto.joinsCommittee === 'true';
    if (!joinsCommittee && dto.appointmentLetterIssued === 'true') throw new BadRequestException('未加入专委会的会员不能发放委员聘书');
    if (joinsCommittee) {
      const committeeId = dto.committeeId ?? before.committeeId;
      if (!committeeId) throw new BadRequestException('加入专委会时必须选择所属专委会');
      await this.requireActiveCommittee(committeeId, user);
    }
    const committeeMemberStatus = joinsCommittee ? dto.committeeMemberStatus ?? before.committeeMemberStatus ?? 'IN_OFFICE' : null;
    const isFormerCommitteeMember = committeeMemberStatus === 'LEFT_OFFICE';
    if (dto.idNumber) await this.requireUniqueMemberIdNumber(dto.idNumber, id);
    const {
      joinedOn, certificateIssued, appointmentLetterIssued, committeeTerm, joinsCommittee: _joinsCommittee,
      idNumber, phone, organizationName, department, email, ...membershipData
    } = dto;
    const membership = await this.prisma.membership.update({
      where: { id }, data: {
        ...membershipData,
        ...(organizationName !== undefined ? { organizationName: organizationName.trim() || null } : {}),
        ...(department !== undefined ? { department: department.trim() || null } : {}),
        ...(email !== undefined ? { email: email.trim() || null } : {}),
        ...(idNumber ? {
          idNumberEncrypted: this.sensitive.encrypt(idNumber.trim()),
          idNumberHash: this.sensitive.hash(idNumber.trim()),
          idNumberMasked: this.sensitive.maskId(idNumber.trim()),
        } : {}),
        ...(phone ? {
          phoneEncrypted: this.sensitive.encrypt(phone.trim()),
          phoneMasked: this.sensitive.maskPhone(phone.trim()),
        } : {}),
        ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId! } : {}),
        ...(dto.joinsCommittee !== undefined ? {
          committeeId: joinsCommittee ? dto.committeeId ?? before.committeeId : null,
          memberPosition: joinsCommittee && !isFormerCommitteeMember ? dto.memberPosition ?? before.memberPosition : null,
          committeeMemberStatus,
          committeeTerm: joinsCommittee && !isFormerCommitteeMember ? (committeeTerm ? Number(committeeTerm) : before.committeeTerm) : null,
          ...(!joinsCommittee ? { appointmentLetterIssued: false } : {}),
        } : {
          ...(committeeTerm !== undefined ? { committeeTerm: committeeTerm ? Number(committeeTerm) : null } : {}),
        }),
        ...(dto.memberPosition !== undefined ? { memberPosition: joinsCommittee && !isFormerCommitteeMember ? dto.memberPosition.trim() || null : null } : {}),
        ...(isFormerCommitteeMember ? { memberPosition: null, committeeTerm: null } : {}),
        ...(joinedOn ? { joinedOn: new Date(joinedOn) } : {}),
        ...(certificateIssued !== undefined ? { certificateIssued: certificateIssued === 'true' } : {}),
        ...(appointmentLetterIssued !== undefined ? { appointmentLetterIssued: appointmentLetterIssued === 'true' } : {}),
      },
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

  private async requireUniqueMemberIdNumber(idNumber: string, excludeId?: string) {
    const duplicate = await this.prisma.membership.findFirst({
      where: { idNumberHash: this.sensitive.hash(idNumber.trim()), ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('身份证号已被其他会员使用');
  }

  private rethrowCommitteeConflict(error: unknown, committeeCode: string, name: string): never {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    if (target.some((field) => field.includes('name'))) throw new ConflictException(`专委会名称“${name}”已存在`);
    throw new ConflictException(`专委会编码“${committeeCode}”已存在`);
  }
}
