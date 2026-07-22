import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateProjectManagerDto, ProjectManagerListQueryDto, UpdateProjectManagerDto } from './project-managers.dto';

const publicProjectManagerSelect = {
  id: true,
  displayName: true,
  department: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: true } },
} satisfies Prisma.ProjectManagerSelect;

@Injectable()
export class ProjectManagersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: ProjectManagerListQueryDto) {
    const where: Prisma.ProjectManagerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { department: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.projectManager.findMany({
        where,
        select: publicProjectManagerSelect,
        orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.projectManager.count({ where }),
    ]);
    return { items, total };
  }

  async options() {
    return this.prisma.projectManager.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, displayName: true, department: true, status: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async create(dto: CreateProjectManagerDto, actorUserId: string) {
    const displayName = dto.displayName.trim();
    if (!displayName) throw new BadRequestException('姓名不能为空');
    const projectManager = await this.prisma.projectManager.create({
      data: {
        displayName,
        department: dto.department?.trim() || null,
        status: 'ACTIVE',
      },
      select: publicProjectManagerSelect,
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'PROJECT_MANAGER', objectId: projectManager.id,
      afterData: { displayName: projectManager.displayName, status: projectManager.status },
    });
    return projectManager;
  }

  async update(id: string, dto: UpdateProjectManagerDto, actorUserId: string) {
    const before = await this.findPm(id);
    const displayName = dto.displayName?.trim();
    if (dto.displayName !== undefined && !displayName) throw new BadRequestException('姓名不能为空');

    const data: Prisma.ProjectManagerUpdateInput = {
      ...(displayName ? { displayName } : {}),
      ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
      ...(dto.status ? { status: dto.status } : {}),
    };
    const projectManager = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.projectManager.update({ where: { id }, data, select: publicProjectManagerSelect });
      if (displayName && displayName !== before.displayName) {
        await transaction.project.updateMany({ where: { pmUserId: id }, data: { pmName: displayName } });
      }
      return updated;
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'PROJECT_MANAGER', objectId: id,
      beforeData: { displayName: before.displayName, status: before.status },
      afterData: { displayName: projectManager.displayName, status: projectManager.status },
    });
    return projectManager;
  }

  async remove(id: string, actorUserId: string) {
    const before = await this.findPm(id);
    const projectManager = await this.prisma.projectManager.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: publicProjectManagerSelect,
    });
    await this.audit.record({
      actorUserId, action: 'DELETE', objectType: 'PROJECT_MANAGER', objectId: id,
      beforeData: { status: before.status }, afterData: { status: projectManager.status },
    });
    return projectManager;
  }

  private async findPm(id: string) {
    const projectManager = await this.prisma.projectManager.findUnique({ where: { id } });
    if (!projectManager) throw new NotFoundException('PM 不存在');
    return projectManager;
  }
}
