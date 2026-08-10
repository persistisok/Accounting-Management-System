import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationRoleType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CreateOrganizationDto, OrganizationListQueryDto, UpdateOrganizationDto } from './organizations.dto';

export function normalizeOrganizationName(value: string) {
  return value.replace(/[\s（）()]/g, '').toLocaleLowerCase('zh-CN');
}

export function normalizeOrganizationPlatform(value: string) {
  return value.replace(/\s/g, '').toLocaleLowerCase('zh-CN');
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: OrganizationListQueryDto, user?: AuthUser) {
    const where: Prisma.OrganizationWhereInput = {
      roles: { some: { roleType: query.roleType } },
      ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      ...(query.q ? { OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { organizationCode: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        include: {
          owner: { select: { id: true, displayName: true } },
          roles: true,
          contracts: { where: { status: 'SIGNED' }, select: { amount: true, contractType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      items: items.map(({ contracts, ...item }) => ({
        ...item,
        joinedOn: item.roles.find((role) => role.roleType === query.roleType)?.joinedOn,
        cumulativeAmount: contracts
          .filter((contract) => query.roleType === 'SUPPORTER' ? contract.contractType === 'SUPPORT' : contract.contractType === 'EXECUTION')
          .reduce((sum, contract) => sum + Number(contract.amount), 0).toFixed(2),
      })),
      total,
    };
  }

  async options(roleType?: OrganizationRoleType, user?: AuthUser) {
    return this.prisma.organization.findMany({
      where: { status: 'ACTIVE', ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}), ...(roleType ? { roles: { some: { roleType, reviewStatus: 'APPROVED' } } } : {}) },
      select: { id: true, organizationCode: true, name: true, roles: { select: { roleType: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateOrganizationDto, actorUserId: string, user?: AuthUser) {
    const ownerUserId = user?.role === 'PM' ? user.projectManagerId : dto.ownerUserId;
    if (!ownerUserId) throw new NotFoundException('PM 账号必须绑定 PM');
    await this.requireActivePm(ownerUserId);
    const normalizedName = normalizeOrganizationName(dto.name);
    const normalizedPlatform = normalizeOrganizationPlatform(dto.platform);
    const duplicate = await this.prisma.organization.findFirst({
      where: { normalizedName, normalizedPlatform },
      include: { roles: true },
    });
    if (duplicate) {
      if (user?.role === 'PM' && duplicate.ownerUserId !== ownerUserId) {
        throw new ConflictException('该机构已由其他 PM 负责');
      }
      const hasRole = duplicate.roles.some((role) => role.roleType === dto.roleType);
      if (hasRole) throw new ConflictException(`“${duplicate.name}”已存在于该资料库`);
      await this.prisma.organizationRole.create({
        data: { organizationId: duplicate.id, roleType: dto.roleType, ...(dto.joinedOn ? { joinedOn: new Date(dto.joinedOn) } : {}) },
      });
      return this.prisma.organization.findUnique({ where: { id: duplicate.id }, include: { roles: true, owner: true } });
    }
    const prefix = dto.roleType === 'SUPPORTER' ? 'SUP' : 'EXE';
    const count = await this.prisma.organizationRole.count({ where: { roleType: dto.roleType } });
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        normalizedName,
        platform: dto.platform,
        normalizedPlatform,
        ownerUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        organizationCode: `${prefix}-${String(count + 1).padStart(4, '0')}`,
        roles: { create: { roleType: dto.roleType, ...(dto.joinedOn ? { joinedOn: new Date(dto.joinedOn) } : {}) } },
      },
      include: { roles: true, owner: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'ORGANIZATION', objectId: organization.id,
      afterData: { name: organization.name, organizationCode: organization.organizationCode, roleType: dto.roleType },
    });
    return organization;
  }

  async update(id: string, roleType: OrganizationRoleType, dto: UpdateOrganizationDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.organization.findFirst({ where: { id, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('机构不存在');
    if (dto.ownerUserId) await this.requireActivePm(dto.ownerUserId);
    const normalizedName = normalizeOrganizationName(dto.name ?? before.name);
    const normalizedPlatform = normalizeOrganizationPlatform(dto.platform ?? before.platform);
    if (dto.name !== undefined || dto.platform !== undefined) {
      const duplicate = await this.prisma.organization.findFirst({
        where: { id: { not: id }, normalizedName, normalizedPlatform },
        select: { name: true },
      });
      if (duplicate) throw new ConflictException(`“${duplicate.name}”在该入库平台中已存在`);
    }
    const { joinedOn, ...organizationData } = dto;
    const organization = await this.prisma.$transaction(async (transaction) => {
      await transaction.organization.update({
        where: { id },
        data: { ...organizationData, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId! } : {}), normalizedName, normalizedPlatform, version: { increment: 1 } },
      });
      if (joinedOn) {
        await transaction.organizationRole.update({
          where: { organizationId_roleType: { organizationId: id, roleType } },
          data: { joinedOn: new Date(joinedOn) },
        });
      }
      return transaction.organization.findUniqueOrThrow({
        where: { id }, include: { roles: true, owner: { select: { id: true, displayName: true } } },
      });
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'ORGANIZATION', objectId: id,
      beforeData: { name: before.name, status: before.status }, afterData: { name: organization.name, status: organization.status },
    });
    return organization;
  }

  async deactivate(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.organization.findFirst({ where: { id, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) } });
    if (!before) throw new NotFoundException('机构不存在');
    const organization = await this.prisma.organization.update({
      where: { id }, data: { status: 'INACTIVE', version: { increment: 1 } },
      include: { roles: true, owner: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'ORGANIZATION', objectId: id, beforeData: { status: before.status }, afterData: { status: 'INACTIVE' } });
    return organization;
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.projectManager.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('负责 PM 不存在或已停用');
  }
}
