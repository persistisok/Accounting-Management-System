import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateProjectManagerDto, ProjectManagerListQueryDto, UpdateProjectManagerDto } from './project-managers.dto';

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  department: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class ProjectManagersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: ProjectManagerListQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: 'PM',
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [
        { username: { contains: query.q, mode: 'insensitive' } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { department: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async options() {
    return this.prisma.user.findMany({
      where: { role: 'PM', status: 'ACTIVE' },
      select: { id: true, username: true, displayName: true, department: true, role: true, status: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async create(dto: CreateProjectManagerDto, actorUserId: string) {
    const username = dto.username.trim();
    const displayName = dto.displayName.trim();
    if (!username || !displayName) throw new BadRequestException('用户名和姓名不能为空');
    await this.ensureUsernameAvailable(username);
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: await hash(dto.password, 12),
        displayName,
        department: dto.department?.trim() || null,
        role: 'PM',
        status: 'ACTIVE',
      },
      select: publicUserSelect,
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'PROJECT_MANAGER', objectId: user.id,
      afterData: { username: user.username, displayName: user.displayName, status: user.status },
    });
    return user;
  }

  async update(id: string, dto: UpdateProjectManagerDto, actorUserId: string) {
    const before = await this.findPm(id);
    const username = dto.username?.trim();
    const displayName = dto.displayName?.trim();
    if (dto.username !== undefined && !username) throw new BadRequestException('用户名不能为空');
    if (dto.displayName !== undefined && !displayName) throw new BadRequestException('姓名不能为空');
    if (username && username !== before.username) await this.ensureUsernameAvailable(username, id);

    const data: Prisma.UserUpdateInput = {
      ...(username ? { username } : {}),
      ...(displayName ? { displayName } : {}),
      ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.password ? { passwordHash: await hash(dto.password, 12) } : {}),
    };
    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({ where: { id }, data, select: publicUserSelect });
      if (displayName && displayName !== before.displayName) {
        await transaction.project.updateMany({ where: { pmUserId: id }, data: { pmName: displayName } });
      }
      return updated;
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'PROJECT_MANAGER', objectId: id,
      beforeData: { username: before.username, displayName: before.displayName, status: before.status },
      afterData: { username: user.username, displayName: user.displayName, status: user.status },
    });
    return user;
  }

  async remove(id: string, actorUserId: string) {
    const before = await this.findPm(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: publicUserSelect,
    });
    await this.audit.record({
      actorUserId, action: 'DELETE', objectType: 'PROJECT_MANAGER', objectId: id,
      beforeData: { status: before.status }, afterData: { status: user.status },
    });
    return user;
  }

  private async findPm(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, role: 'PM' } });
    if (!user) throw new NotFoundException('PM 不存在');
    return user;
  }

  private async ensureUsernameAvailable(username: string, excludeId?: string) {
    const duplicate = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('用户名已存在');
  }
}
