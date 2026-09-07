import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DonationReceiptStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import type { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { projectScopeFor } from '../projects/projects.service';
import { CreateDonationReceiptDto, DonationReceiptListQueryDto, UpdateDonationReceiptDto } from './donation-receipts.dto';

const relations = {
  project: { select: { id: true, projectCode: true, name: true, pmUserId: true } },
  donor: { select: { id: true, organizationCode: true, name: true } },
} satisfies Prisma.DonationReceiptInclude;

@Injectable()
export class DonationReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: DonationReceiptListQueryDto, user: AuthUser) {
    if (query.issuedFrom && query.issuedTo && query.issuedFrom > query.issuedTo) {
      throw new BadRequestException('开具日期结束时间不能早于起始时间');
    }
    const where: Prisma.DonationReceiptWhereInput = {
      project: projectScopeFor(user),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.donorId ? { donorId: query.donorId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...((query.issuedFrom || query.issuedTo) ? { issuedOn: {
        ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
        ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { receiptNumber: { contains: query.q, mode: 'insensitive' } },
        { project: { OR: [{ projectCode: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] } },
        { donor: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total, amount] = await this.prisma.$transaction([
      this.prisma.donationReceipt.findMany({
        where, include: relations, orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
      this.prisma.donationReceipt.count({ where }),
      this.prisma.donationReceipt.aggregate({ where, _sum: { amount: true } }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'DONATION_RECEIPT', items.map((item) => item.id));
    return {
      items: items.map((item) => ({ ...item, attachments: attachments[item.id] ?? [] })),
      total,
      summary: { amount: Number(amount._sum.amount ?? 0).toFixed(2), count: total },
    };
  }

  async create(dto: CreateDonationReceiptDto, actorUserId: string, user: AuthUser) {
    await this.validateRelations(dto.projectId, dto.donorId, user);
    await this.ensureNumberAvailable(dto.receiptNumber);
    if (Number(dto.amount) <= 0) throw new BadRequestException('票据金额必须大于零');
    const receipt = await this.prisma.donationReceipt.create({
      data: {
        receiptNumber: dto.receiptNumber.trim(), projectId: dto.projectId, donorId: dto.donorId,
        issuedOn: new Date(dto.issuedOn), amount: dto.amount, remark: dto.remark?.trim() || null,
      },
      include: relations,
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'DONATION_RECEIPT', objectId: receipt.id,
      afterData: { receiptNumber: receipt.receiptNumber, projectId: receipt.projectId, donorId: receipt.donorId, amount: receipt.amount.toString() },
    });
    return receipt;
  }

  async update(id: string, dto: UpdateDonationReceiptDto, actorUserId: string, user: AuthUser) {
    const before = await this.findScoped(id, user);
    if (before.status === DonationReceiptStatus.VOID) throw new BadRequestException('已作废捐赠票据不能编辑');
    const projectId = dto.projectId ?? before.projectId;
    const donorId = dto.donorId ?? before.donorId;
    await this.validateRelations(projectId, donorId, user);
    if (dto.receiptNumber) await this.ensureNumberAvailable(dto.receiptNumber, id);
    if (dto.amount !== undefined && Number(dto.amount) <= 0) throw new BadRequestException('票据金额必须大于零');
    const receipt = await this.prisma.donationReceipt.update({
      where: { id },
      data: {
        ...(dto.receiptNumber !== undefined ? { receiptNumber: dto.receiptNumber.trim() } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.donorId !== undefined ? { donorId: dto.donorId } : {}),
        ...(dto.issuedOn !== undefined ? { issuedOn: new Date(dto.issuedOn) } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark.trim() || null } : {}),
        version: { increment: 1 },
      },
      include: relations,
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'DONATION_RECEIPT', objectId: id,
      beforeData: { receiptNumber: before.receiptNumber, projectId: before.projectId, donorId: before.donorId, amount: before.amount.toString() },
      afterData: { receiptNumber: receipt.receiptNumber, projectId: receipt.projectId, donorId: receipt.donorId, amount: receipt.amount.toString() },
    });
    return receipt;
  }

  async void(id: string, actorUserId: string, user: AuthUser) {
    const before = await this.findScoped(id, user);
    if (before.status === DonationReceiptStatus.VOID) throw new BadRequestException('捐赠票据已作废');
    const receipt = await this.prisma.donationReceipt.update({ where: { id }, data: { status: 'VOID', version: { increment: 1 } }, include: relations });
    await this.audit.record({
      actorUserId, action: 'VOID', objectType: 'DONATION_RECEIPT', objectId: id,
      beforeData: { status: before.status }, afterData: { status: receipt.status },
    });
    return receipt;
  }

  private async findScoped(id: string, user: AuthUser) {
    const receipt = await this.prisma.donationReceipt.findFirst({ where: { id, project: projectScopeFor(user) } });
    if (!receipt) throw new NotFoundException('捐赠票据不存在或不在当前账号授权范围内');
    return receipt;
  }

  private async validateRelations(projectId: string, donorId: string, user: AuthUser) {
    const [project, donor] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, status: 'ACTIVE', AND: projectScopeFor(user) }, select: { id: true } }),
      this.prisma.organization.findFirst({ where: { id: donorId, status: 'ACTIVE', roles: { some: { roleType: 'SUPPORTER', reviewStatus: 'APPROVED' } } }, select: { id: true } }),
    ]);
    if (!project) throw new NotFoundException('关联项目不存在、已结束或不在当前账号授权范围内');
    if (!donor) throw new NotFoundException('捐赠方不存在或未作为支持方入库');
  }

  private async ensureNumberAvailable(value: string, excludeId?: string) {
    const receiptNumber = value.trim();
    if (!receiptNumber) throw new BadRequestException('票据编号不能为空');
    const duplicate = await this.prisma.donationReceipt.findFirst({
      where: { receiptNumber: { equals: receiptNumber, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(`捐赠票据编号“${receiptNumber}”已存在`);
  }
}
