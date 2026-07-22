import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationRoleType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateOrganizationDto, OrganizationListQueryDto, UpdateOrganizationDto } from './organizations.dto';

export function normalizeOrganizationName(value: string) {
  return value.replace(/[\s（）()]/g, '').toLocaleLowerCase('zh-CN');
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: OrganizationListQueryDto) {
    const where: Prisma.OrganizationWhereInput = {
      roles: { some: { roleType: query.roleType } },
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
        cumulativeAmount: contracts
          .filter((contract) => query.roleType === 'SUPPORTER' ? contract.contractType === 'SUPPORT' : contract.contractType === 'EXECUTION')
          .reduce((sum, contract) => sum + Number(contract.amount), 0).toFixed(2),
      })),
      total,
    };
  }

  async options(roleType?: OrganizationRoleType) {
    return this.prisma.organization.findMany({
      where: { status: 'ACTIVE', ...(roleType ? { roles: { some: { roleType, reviewStatus: 'APPROVED' } } } : {}) },
      select: { id: true, organizationCode: true, name: true, roles: { select: { roleType: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateOrganizationDto, actorUserId: string) {
    await this.requireActivePm(dto.ownerUserId);
    const normalizedName = normalizeOrganizationName(dto.name);
    const duplicate = await this.prisma.organization.findFirst({
      where: { normalizedName },
      include: { roles: true },
    });
    if (duplicate) {
      const hasRole = duplicate.roles.some((role) => role.roleType === dto.roleType);
      if (hasRole) throw new ConflictException(`“${duplicate.name}”已存在于该资料库`);
      await this.prisma.organizationRole.create({
        data: { organizationId: duplicate.id, roleType: dto.roleType },
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
        ownerUserId: dto.ownerUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        organizationCode: `${prefix}-${String(count + 1).padStart(4, '0')}`,
        roles: { create: { roleType: dto.roleType } },
      },
      include: { roles: true, owner: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'ORGANIZATION', objectId: organization.id,
      afterData: { name: organization.name, organizationCode: organization.organizationCode, roleType: dto.roleType },
    });
    return organization;
  }

  async update(id: string, dto: UpdateOrganizationDto, actorUserId: string) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('机构不存在');
    if (dto.ownerUserId) await this.requireActivePm(dto.ownerUserId);
    const normalizedName = dto.name ? normalizeOrganizationName(dto.name) : undefined;
    if (normalizedName) {
      const duplicate = await this.prisma.organization.findFirst({
        where: { id: { not: id }, normalizedName },
        select: { name: true },
      });
      if (duplicate) throw new ConflictException(`“${duplicate.name}”与修改后的机构信息重复`);
    }
    const organization = await this.prisma.organization.update({
      where: { id },
      data: { ...dto, ...(normalizedName ? { normalizedName } : {}), version: { increment: 1 } },
      include: { roles: true, owner: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'ORGANIZATION', objectId: id,
      beforeData: { name: before.name, status: before.status }, afterData: { name: organization.name, status: organization.status },
    });
    return organization;
  }

  async deactivate(id: string, actorUserId: string) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
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
