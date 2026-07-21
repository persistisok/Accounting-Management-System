import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateInvoiceDto, InvoiceListQueryDto, UpdateInvoiceDto } from './invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: InvoiceListQueryDto) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [
        { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
        { buyerName: { contains: query.q, mode: 'insensitive' } },
        { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
        { project: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { project: { select: { id: true, projectCode: true, name: true } } },
        orderBy: { issuedOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }

  async create(dto: CreateInvoiceDto, actorUserId: string) {
    this.validateAmounts(dto.amountExcludingTax, dto.taxAmount, dto.totalAmount);
    if (dto.kind === 'RED') {
      if (!dto.originalInvoiceId) throw new BadRequestException('红字发票必须关联原发票');
      const original = await this.prisma.invoice.findUnique({ where: { id: dto.originalInvoiceId } });
      if (!original || original.kind !== 'BLUE' || original.status !== 'NORMAL') {
        throw new BadRequestException('原发票必须是有效蓝票');
      }
      if (original.projectId !== dto.projectId) throw new BadRequestException('红字发票必须与原发票属于同一项目');
    } else if (dto.originalInvoiceId) {
      throw new BadRequestException('蓝票不能关联原发票');
    }
    const invoice = await this.prisma.invoice.create({
      data: { ...dto, issuedOn: new Date(dto.issuedOn), kind: dto.kind ?? 'BLUE' },
      include: { project: { select: { projectCode: true, name: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'INVOICE', objectId: invoice.id,
      afterData: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount.toString(), kind: invoice.kind },
    });
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto, actorUserId: string) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('发票不存在');
    if (before.status === 'VOID') throw new BadRequestException('已作废发票不能编辑');
    if (dto.projectId && dto.projectId !== before.projectId) {
      if (before.kind === 'RED') throw new BadRequestException('红字发票不能更换关联项目');
      const redInvoice = await this.prisma.invoice.findFirst({ where: { originalInvoiceId: id }, select: { id: true } });
      if (redInvoice) throw new BadRequestException('已关联红字发票的蓝票不能更换项目');
    }
    this.validateAmounts(
      dto.amountExcludingTax ?? before.amountExcludingTax.toString(),
      dto.taxAmount ?? before.taxAmount.toString(),
      dto.totalAmount ?? before.totalAmount.toString(),
    );
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { ...dto, ...(dto.issuedOn ? { issuedOn: new Date(dto.issuedOn) } : {}), version: { increment: 1 } },
      include: { project: { select: { id: true, projectCode: true, name: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'INVOICE', objectId: id,
      beforeData: { invoiceNumber: before.invoiceNumber, totalAmount: before.totalAmount.toString() },
      afterData: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount.toString() },
    });
    return invoice;
  }

  async void(id: string, actorUserId: string) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('发票不存在');
    const invoice = await this.prisma.invoice.update({
      where: { id }, data: { status: InvoiceStatus.VOID, version: { increment: 1 } },
    });
    await this.audit.record({
      actorUserId, action: 'VOID', objectType: 'INVOICE', objectId: id,
      beforeData: { status: before.status }, afterData: { status: invoice.status },
    });
    return invoice;
  }

  private validateAmounts(amountExcludingTax: string, taxAmount: string, totalAmount: string) {
    const expected = Number(amountExcludingTax) + Number(taxAmount);
    if ([amountExcludingTax, taxAmount, totalAmount].some((value) => Number(value) < 0)) throw new BadRequestException('发票金额不能为负数');
    if (Math.abs(expected - Number(totalAmount)) > 0.02) throw new BadRequestException('价税合计必须等于不含税金额加税额');
  }
}
