import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionLevel, PermissionResource, Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { AccountListQueryDto, CreateAccountDto, UpdateAccountDto } from './accounts.dto';

const publicAccountSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  projectManagerId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  projectManager: { select: { id: true, displayName: true, department: true, status: true } },
  permissions: { select: { resource: true, level: true }, orderBy: { resource: 'asc' } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: AccountListQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? {
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { projectManager: { displayName: { contains: query.q, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicAccountSelect,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async create(dto: CreateAccountDto, actorUserId: string) {
    const username = dto.username.trim();
    const displayName = dto.displayName.trim();
    this.validateRequired(username, displayName);
    const projectManagerId = await this.resolveProjectManagerId(dto.role, dto.projectManagerId);
    const permissions = this.normalizePermissions(dto.role, dto.permissions ?? []);
    await this.ensureUsernameAvailable(username);

    try {
      const account = await this.prisma.user.create({
        data: {
          username,
          passwordHash: await hash(dto.password, 12),
          displayName,
          role: dto.role,
          projectManagerId,
          status: 'ACTIVE',
          permissions: { create: permissions },
        },
        select: publicAccountSelect,
      });
      await this.audit.record({
        actorUserId,
        action: 'CREATE',
        objectType: 'ACCOUNT',
        objectId: account.id,
        afterData: { username: account.username, displayName: account.displayName, role: account.role },
      });
      return account;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateAccountDto, actorUserId: string) {
    const before = await this.findAccount(id);
    if (id === actorUserId && ((dto.role && dto.role !== before.role) || dto.status === 'INACTIVE')) {
      throw new BadRequestException('不能修改当前登录账号的类型或将其停用');
    }

    const username = dto.username?.trim();
    const displayName = dto.displayName?.trim();
    if (dto.username !== undefined && !username) throw new BadRequestException('用户名不能为空');
    if (dto.displayName !== undefined && !displayName) throw new BadRequestException('姓名不能为空');
    if (username && username !== before.username) await this.ensureUsernameAvailable(username, id);

    const role = dto.role ?? before.role;
    const requestedPmId = dto.projectManagerId !== undefined ? dto.projectManagerId : before.projectManagerId;
    const projectManagerId = await this.resolveProjectManagerId(role, requestedPmId, id);
    const deactivating = dto.status === 'INACTIVE';
    const permissions = this.normalizePermissions(role, dto.permissions ?? before.permissions);
    const data: Prisma.UserUpdateInput = {
      ...(username ? { username } : {}),
      ...(displayName ? { displayName } : {}),
      ...(dto.password ? { passwordHash: await hash(dto.password, 12) } : {}),
      role,
      status: dto.status ?? before.status,
      // A disabled account must not reserve its PM for a future account.
      projectManager: deactivating ? { disconnect: true } : projectManagerId ? { connect: { id: projectManagerId } } : { disconnect: true },
      permissions: { deleteMany: {}, create: permissions },
    };

    try {
      const account = await this.prisma.user.update({ where: { id }, data, select: publicAccountSelect });
      await this.audit.record({
        actorUserId,
        action: 'UPDATE',
        objectType: 'ACCOUNT',
        objectId: id,
        beforeData: { username: before.username, displayName: before.displayName, role: before.role, status: before.status },
        afterData: { username: account.username, displayName: account.displayName, role: account.role, status: account.status },
      });
      return account;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    if (id === actorUserId) throw new BadRequestException('不能停用当前登录账号');
    const before = await this.findAccount(id);
    const account = await this.prisma.user.update({
      where: { id },
      // Release the one-to-one PM binding when the account is disabled.
      data: { status: 'INACTIVE', projectManager: { disconnect: true } },
      select: publicAccountSelect,
    });
    await this.audit.record({
      actorUserId,
      action: 'DELETE',
      objectType: 'ACCOUNT',
      objectId: id,
      beforeData: { status: before.status },
      afterData: { status: account.status },
    });
    return account;
  }

  private validateRequired(username: string, displayName: string) {
    if (!username) throw new BadRequestException('用户名不能为空');
    if (!displayName) throw new BadRequestException('姓名不能为空');
  }

  private async resolveProjectManagerId(role: UserRole, projectManagerId?: string | null, excludeAccountId?: string) {
    if (role !== 'PM') return null;
    if (!projectManagerId) {
      if (role === 'PM') throw new BadRequestException('PM 账号必须绑定 PM');
      return null;
    }
    const projectManager = await this.prisma.projectManager.findFirst({
      where: { id: projectManagerId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!projectManager) throw new BadRequestException('绑定的 PM 不存在或已停用');
    const boundAccount = await this.prisma.user.findFirst({
      where: { projectManagerId, ...(excludeAccountId ? { id: { not: excludeAccountId } } : {}) },
      select: { id: true },
    });
    if (boundAccount) throw new ConflictException('该 PM 已绑定其他账号');
    return projectManagerId;
  }

  private normalizePermissions(
    role: UserRole,
    permissions: { resource: PermissionResource; level: PermissionLevel }[],
  ) {
    if (role !== 'ADMIN' && role !== 'PM') return [];
    const allowedResources = role === 'PM'
      ? new Set<PermissionResource>(['SUPPORTERS', 'EXECUTORS', 'EXPERTS', 'MEMBERS'])
      : null;
    const seen = new Set<PermissionResource>();
    return permissions.map((permission) => {
      if (allowedResources && !allowedResources.has(permission.resource)) {
        throw new BadRequestException('PM 仅需设置四个资料库的权限');
      }
      if (seen.has(permission.resource)) throw new BadRequestException('同一模块不能重复设置权限');
      if (permission.level === 'REVIEW' && !['PROJECTS', 'EXPERTS'].includes(permission.resource)) {
        throw new BadRequestException('只有项目台账和专家库可以设置复核权限');
      }
      seen.add(permission.resource);
      return { resource: permission.resource, level: permission.level };
    });
  }

  private async ensureUsernameAvailable(username: string, excludeId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('用户名已存在');
  }

  private async findAccount(id: string) {
    const account = await this.prisma.user.findUnique({ where: { id }, include: { permissions: true } });
    if (!account) throw new NotFoundException('账号不存在');
    return account;
  }

  private handleUniqueConstraint(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.target ?? '');
      throw new ConflictException(target.includes('project_manager_id') ? '该 PM 已绑定其他账号' : '用户名已存在');
    }
  }
}
