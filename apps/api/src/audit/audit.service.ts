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
    return { items, total };
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
}
