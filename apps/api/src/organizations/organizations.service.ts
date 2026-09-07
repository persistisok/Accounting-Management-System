import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationRoleType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CreateOrganizationDto, CreateServiceCapabilityDto, OrganizationListQueryDto, ReorderServiceCapabilitiesDto, UpdateOrganizationDto, UpdateServiceCapabilityDto } from './organizations.dto';
import { EXECUTOR_DOCUMENT_TYPES, type ExecutorDocumentType } from './organization-documents.service';

const EXECUTOR_INTERNAL_PLATFORM = '执行方库';

export function normalizeOrganizationName(value: string) {
  return value.replace(/[\s（）()]/g, '').toLocaleLowerCase('zh-CN');
}

export function normalizeOrganizationPlatform(value: string) {
  return value.replace(/\s/g, '').toLocaleLowerCase('zh-CN');
}

export function normalizeCapabilityName(value: string) {
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
          serviceCapabilities: { include: { capability: true }, orderBy: { capability: { sortOrder: 'asc' } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.organization.count({ where }),
    ]);
    const documents = query.roleType === 'EXECUTOR' ? await this.executorDocumentMap(items.map((item) => item.id)) : {};
    return {
      items: items.map(({ contracts, ...item }) => ({
        ...item,
        serviceCapabilities: item.serviceCapabilities.map((selection) => selection.capability),
        documents: documents[item.id] ?? [],
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
      where: {
        status: 'ACTIVE',
        ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
        ...(roleType ? { roles: { some: { roleType, reviewStatus: 'APPROVED' } } } : {}),
      },
      select: { id: true, organizationCode: true, name: true, roles: { select: { roleType: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateOrganizationDto, actorUserId: string, user?: AuthUser) {
    const ownerUserId = user?.role === 'PM' ? user.projectManagerId : dto.ownerUserId;
    if (!ownerUserId) throw new NotFoundException('PM 账号必须绑定 PM');
    await this.requireActivePm(ownerUserId);
    const normalizedName = normalizeOrganizationName(dto.name);
    const platform = dto.roleType === 'EXECUTOR' ? EXECUTOR_INTERNAL_PLATFORM : dto.platform?.trim();
    if (!platform) throw new ConflictException('支持方必须填写入库平台');
    const normalizedPlatform = normalizeOrganizationPlatform(platform);
    const duplicate = await this.prisma.organization.findFirst({
      where: dto.roleType === 'EXECUTOR'
        ? { normalizedName, roles: { some: { roleType: 'EXECUTOR' } } }
        : { normalizedName, normalizedPlatform },
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
    const capabilitySelection = dto.roleType === 'EXECUTOR'
      ? await this.validateCapabilities(dto.serviceCapabilityIds ?? [], dto.otherCapabilityNote)
      : { ids: [] as string[], otherNote: null };
    const prefix = dto.roleType === 'SUPPORTER' ? 'SUP' : 'EXE';
    const count = await this.prisma.organizationRole.count({ where: { roleType: dto.roleType } });
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        normalizedName,
        platform,
        normalizedPlatform,
        ownerUserId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        executorOtherCapabilityNote: capabilitySelection.otherNote,
        organizationCode: `${prefix}-${String(count + 1).padStart(4, '0')}`,
        roles: { create: { roleType: dto.roleType, ...(dto.joinedOn ? { joinedOn: new Date(dto.joinedOn) } : {}) } },
        serviceCapabilities: { create: capabilitySelection.ids.map((capabilityId) => ({ capabilityId })) },
      },
      include: {
        roles: true,
        owner: { select: { id: true, displayName: true } },
        serviceCapabilities: { include: { capability: true } },
      },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'ORGANIZATION', objectId: organization.id,
      afterData: { name: organization.name, organizationCode: organization.organizationCode, roleType: dto.roleType },
    });
    return organization;
  }

  async update(id: string, roleType: OrganizationRoleType, dto: UpdateOrganizationDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.organization.findFirst({
      where: { id, ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
      include: { serviceCapabilities: { include: { capability: true } } },
    });
    if (!before) throw new NotFoundException('机构不存在');
    if (dto.ownerUserId) await this.requireActivePm(dto.ownerUserId);
    const normalizedName = normalizeOrganizationName(dto.name ?? before.name);
    const platform = roleType === 'EXECUTOR' ? before.platform : dto.platform?.trim() ?? before.platform;
    if (!platform) throw new ConflictException('支持方必须填写入库平台');
    const normalizedPlatform = normalizeOrganizationPlatform(platform);
    if (dto.name !== undefined || dto.platform !== undefined) {
      const duplicate = await this.prisma.organization.findFirst({
        where: roleType === 'EXECUTOR'
          ? { id: { not: id }, normalizedName, roles: { some: { roleType: 'EXECUTOR' } } }
          : { id: { not: id }, normalizedName, normalizedPlatform },
        select: { name: true },
      });
      if (duplicate) throw new ConflictException(`“${duplicate.name}”在该入库平台中已存在`);
    }
    const selectedCapabilityIds = roleType === 'EXECUTOR'
      ? dto.serviceCapabilityIds ?? before.serviceCapabilities.map((selection) => selection.capabilityId)
      : [];
    const capabilitySelection = roleType === 'EXECUTOR'
      ? await this.validateCapabilities(selectedCapabilityIds, dto.otherCapabilityNote ?? before.executorOtherCapabilityNote ?? undefined, new Set(before.serviceCapabilities.map((selection) => selection.capabilityId)))
      : { ids: [] as string[], otherNote: null };
    const { joinedOn, serviceCapabilityIds: _serviceCapabilityIds, otherCapabilityNote: _otherCapabilityNote, platform: _platform, ...organizationData } = dto;
    const organization = await this.prisma.$transaction(async (transaction) => {
      await transaction.organization.update({
        where: { id },
        data: {
          ...organizationData,
          ...(user?.role === 'PM' ? { ownerUserId: user.projectManagerId! } : {}),
          platform,
          normalizedName,
          normalizedPlatform,
          ...(roleType === 'EXECUTOR' ? {
            executorOtherCapabilityNote: capabilitySelection.otherNote,
            ...(dto.serviceCapabilityIds ? { serviceCapabilities: { deleteMany: {}, create: capabilitySelection.ids.map((capabilityId) => ({ capabilityId })) } } : {}),
          } : {}),
          version: { increment: 1 },
        },
      });
      if (joinedOn) {
        await transaction.organizationRole.update({
          where: { organizationId_roleType: { organizationId: id, roleType } },
          data: { joinedOn: new Date(joinedOn) },
        });
      }
      return transaction.organization.findUniqueOrThrow({
        where: { id }, include: { roles: true, owner: { select: { id: true, displayName: true } }, serviceCapabilities: { include: { capability: true } } },
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

  async assertScope(id: string, roleType: OrganizationRoleType, user: AuthUser) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        roles: { some: { roleType } },
        ...(user.role === 'PM' ? { ownerUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException('执行方不存在或不在当前账号权限范围内');
  }

  serviceCapabilities() {
    return this.prisma.serviceCapability.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async createServiceCapability(dto: CreateServiceCapabilityDto, actorUserId: string) {
    const name = dto.name.trim();
    if (!name) throw new ConflictException('服务能力名称不能为空');
    const normalizedName = normalizeCapabilityName(name);
    const existing = await this.prisma.serviceCapability.findUnique({ where: { normalizedName } });
    if (existing) throw new ConflictException('该服务能力已存在');
    const maximum = await this.prisma.serviceCapability.aggregate({ _max: { sortOrder: true } });
    const capability = await this.prisma.serviceCapability.create({
      data: { name, normalizedName, sortOrder: (maximum._max.sortOrder ?? 0) + 10 },
    });
    await this.audit.record({ actorUserId, action: 'CREATE', objectType: 'SERVICE_CAPABILITY', objectId: capability.id, afterData: { name } });
    return capability;
  }

  async updateServiceCapability(id: string, dto: UpdateServiceCapabilityDto, actorUserId: string) {
    const before = await this.prisma.serviceCapability.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('服务能力不存在');
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new ConflictException('服务能力名称不能为空');
    const normalizedName = name ? normalizeCapabilityName(name) : undefined;
    if (normalizedName) {
      const duplicate = await this.prisma.serviceCapability.findFirst({ where: { id: { not: id }, normalizedName } });
      if (duplicate) throw new ConflictException('该服务能力已存在');
    }
    const capability = await this.prisma.serviceCapability.update({
      where: { id }, data: { ...(name ? { name, normalizedName } : {}), ...(dto.status ? { status: dto.status } : {}) },
    });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'SERVICE_CAPABILITY', objectId: id, beforeData: { name: before.name, status: before.status }, afterData: { name: capability.name, status: capability.status } });
    return capability;
  }

  async reorderServiceCapabilities(dto: ReorderServiceCapabilitiesDto, actorUserId: string) {
    const auditObjectId = dto.ids[0];
    if (!auditObjectId) throw new ConflictException('服务能力排序不能为空');
    const existing = await this.prisma.serviceCapability.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((item) => item.id));
    if (dto.ids.length !== existing.length || dto.ids.some((id) => !existingIds.has(id))) {
      throw new ConflictException('服务能力列表已发生变化，请刷新后重新排序');
    }
    await this.prisma.$transaction(dto.ids.map((id, index) => this.prisma.serviceCapability.update({
      where: { id }, data: { sortOrder: (index + 1) * 10 },
    })));
    await this.audit.record({
      actorUserId,
      action: 'REORDER',
      objectType: 'SERVICE_CAPABILITY',
      objectId: auditObjectId,
      afterData: { ids: dto.ids },
    });
    return this.serviceCapabilities();
  }

  async deleteServiceCapability(id: string, actorUserId: string) {
    const before = await this.prisma.serviceCapability.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('服务能力不存在');
    const usageCount = await this.prisma.executorServiceCapability.count({ where: { capabilityId: id } });
    const capability = usageCount
      ? await this.prisma.serviceCapability.update({ where: { id }, data: { status: 'INACTIVE' } })
      : await this.prisma.serviceCapability.delete({ where: { id } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'SERVICE_CAPABILITY', objectId: id, beforeData: { name: before.name }, afterData: { mode: usageCount ? 'DEACTIVATED' : 'DELETED' } });
    return capability;
  }

  private async validateCapabilities(ids: string[], otherNote?: string, existingIds = new Set<string>()) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 3) throw new ConflictException('服务能力最多选择 3 项');
    const capabilities = uniqueIds.length ? await this.prisma.serviceCapability.findMany({ where: { id: { in: uniqueIds } } }) : [];
    if (capabilities.length !== uniqueIds.length || capabilities.some((item) => item.status !== 'ACTIVE' && !existingIds.has(item.id))) {
      throw new ConflictException('服务能力中包含不存在或已停用的选项');
    }
    const includesOther = capabilities.some((item) => item.isOther);
    const normalizedNote = otherNote?.trim() || null;
    if (includesOther && !normalizedNote) throw new ConflictException('选择“其他”时必须填写服务能力备注');
    return { ids: uniqueIds, otherNote: includesOther ? normalizedNote : null };
  }

  private async executorDocumentMap(organizationIds: string[]) {
    if (!organizationIds.length) return {} as Record<string, Array<Record<string, unknown>>>;
    const attachments = await this.prisma.attachment.findMany({
      where: { objectId: { in: organizationIds }, objectType: { in: [...EXECUTOR_DOCUMENT_TYPES] } },
      select: { id: true, objectId: true, objectType: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.reduce<Record<string, Array<Record<string, unknown>>>>((result, attachment) => {
      (result[attachment.objectId] ??= []).push({
        ...attachment,
        sizeBytes: attachment.sizeBytes.toString(),
        documentType: attachment.objectType as ExecutorDocumentType,
      });
      return result;
    }, {});
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.projectManager.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('负责 PM 不存在或已停用');
  }
}
