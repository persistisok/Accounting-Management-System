import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditLogListQueryDto } from './audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    actorUserId?: string;
    action: string;
    objectType: string;
    objectId: string;
    beforeData?: Prisma.InputJsonValue;
    afterData?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({ data: input });
  }

  async list(query: AuditLogListQueryDto) {
    if (query.occurredFrom && query.occurredTo && query.occurredFrom > query.occurredTo) {
      throw new BadRequestException('操作时间结束日期不能早于起始日期');
    }
    const occurredTo = query.occurredTo ? new Date(query.occurredTo) : undefined;
    if (occurredTo) occurredTo.setUTCHours(23, 59, 59, 999);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.objectType ? { objectType: query.objectType } : {}),
      ...((query.occurredFrom || occurredTo) ? { occurredAt: {
        ...(query.occurredFrom ? { gte: new Date(query.occurredFrom) } : {}),
        ...(occurredTo ? { lte: occurredTo } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { action: { contains: query.q, mode: 'insensitive' } },
        { objectType: { contains: query.q, mode: 'insensitive' } },
        { actor: { OR: [{ displayName: { contains: query.q, mode: 'insensitive' } }, { username: { contains: query.q, mode: 'insensitive' } }] } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true, username: true } } },
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const objectNames = await this.resolveObjectNames(items);
    return {
      items: items.map((item) => ({ ...item, objectDisplayName: objectNames.get(`${item.objectType}:${item.objectId}`) })),
      total,
    };
  }

  async filterOptions() {
    const [actors, actions, objectTypes] = await Promise.all([
      this.prisma.user.findMany({
        where: { auditLogs: { some: {} } }, select: { id: true, displayName: true, username: true }, orderBy: { displayName: 'asc' },
      }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['objectType'], select: { objectType: true }, orderBy: { objectType: 'asc' } }),
    ]);
    return { actors, actions: actions.map((item) => item.action), objectTypes: objectTypes.map((item) => item.objectType) };
  }

  private async resolveObjectNames(items: Array<{ objectType: string; objectId: string }>) {
    const names = new Map<string, string>();
    const ids = (type: string) => [...new Set(items.filter((item) => item.objectType === type).map((item) => item.objectId))];
    const queries = [
      this.resolve(ids('PROJECT'), 'PROJECT', (values) => this.prisma.project.findMany({ where: { id: { in: values } }, select: { id: true, projectCode: true, name: true } }), (item) => `${item.projectCode} · ${item.name}`),
      this.resolve(ids('CONTRACT'), 'CONTRACT', (values) => this.prisma.contract.findMany({ where: { id: { in: values } }, select: { id: true, contractNo: true } }), (item) => item.contractNo),
      this.resolve(ids('BANK_TRANSACTION'), 'BANK_TRANSACTION', (values) => this.prisma.bankTransaction.findMany({ where: { id: { in: values } }, select: { id: true, counterpartyName: true } }), (item) => item.counterpartyName),
      this.resolve(ids('BANK_ACCOUNT'), 'BANK_ACCOUNT', (values) => this.prisma.bankAccount.findMany({ where: { id: { in: values } }, select: { id: true, bankName: true, accountNumberMasked: true } }), (item) => `${item.bankName} · ${item.accountNumberMasked}`),
      this.resolve(ids('INVOICE'), 'INVOICE', (values) => this.prisma.invoice.findMany({ where: { id: { in: values } }, select: { id: true, invoiceType: true, buyerName: true } }), (item) => `${item.invoiceType} · ${item.buyerName}`),
      this.resolve(ids('DONATION_RECEIPT'), 'DONATION_RECEIPT', (values) => this.prisma.donationReceipt.findMany({ where: { id: { in: values } }, select: { id: true, donorName: true, sellerName: true } }), (item) => `${item.donorName} · ${item.sellerName}`),
      this.resolve(ids('MEMBERSHIP'), 'MEMBERSHIP', (values) => this.prisma.membership.findMany({ where: { id: { in: values } }, select: { id: true, memberName: true } }), (item) => item.memberName),
      this.resolve(ids('MEMBER_DUE'), 'MEMBER_DUE', (values) => this.prisma.memberDue.findMany({ where: { id: { in: values } }, select: { id: true, dueCode: true, membership: { select: { memberName: true } } } }), (item) => `${item.membership.memberName} · ${item.dueCode}`),
      this.resolve(ids('COMMITTEE'), 'COMMITTEE', (values) => this.prisma.committee.findMany({ where: { id: { in: values } }, select: { id: true, committeeCode: true, name: true } }), (item) => `${item.committeeCode} · ${item.name}`),
      this.resolve(ids('EXPERT'), 'EXPERT', (values) => this.prisma.expertProfile.findMany({ where: { id: { in: values } }, select: { id: true, person: { select: { name: true } } } }), (item) => item.person.name),
      this.resolve(ids('ORGANIZATION'), 'ORGANIZATION', (values) => this.prisma.organization.findMany({ where: { id: { in: values } }, select: { id: true, organizationCode: true, name: true } }), (item) => `${item.organizationCode} · ${item.name}`),
      this.resolve(ids('ACCOUNT'), 'ACCOUNT', (values) => this.prisma.user.findMany({ where: { id: { in: values } }, select: { id: true, displayName: true, username: true } }), (item) => `${item.displayName} · @${item.username}`),
      this.resolve(ids('PROJECT_MANAGER'), 'PROJECT_MANAGER', (values) => this.prisma.projectManager.findMany({ where: { id: { in: values } }, select: { id: true, displayName: true } }), (item) => item.displayName),
      this.resolve(ids('SERVICE_CAPABILITY'), 'SERVICE_CAPABILITY', (values) => this.prisma.serviceCapability.findMany({ where: { id: { in: values } }, select: { id: true, name: true } }), (item) => item.name),
      this.resolve(ids('PROJECT_ARCHIVE_ITEM'), 'PROJECT_ARCHIVE_ITEM', (values) => this.prisma.projectArchiveItem.findMany({ where: { id: { in: values } }, select: { id: true, itemKey: true, project: { select: { projectCode: true } } } }), (item) => `${item.project.projectCode} · ${item.itemKey}`),
    ];
    for (const entries of await Promise.all(queries)) for (const [key, value] of entries) names.set(key, value);
    return names;
  }

  private async resolve<T extends { id: string }>(
    ids: string[],
    type: string,
    query: (ids: string[]) => Promise<T[]>,
    label: (item: T) => string,
  ): Promise<Array<[string, string]>> {
    if (!ids.length) return [];
    return (await query(ids)).map((item) => [`${type}:${item.id}`, label(item)]);
  }
}
