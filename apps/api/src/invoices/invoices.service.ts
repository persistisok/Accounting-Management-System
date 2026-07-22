import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
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
        { invoiceType: { contains: query.q, mode: 'insensitive' } },
        { invoicePlatform: { contains: query.q, mode: 'insensitive' } },
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
    const attachments = await attachmentMap(this.prisma, 'INVOICE', items.map((item) => item.id));
    return { items: items.map((item) => ({ ...item, attachments: attachments[item.id] ?? [] })), total };
  }

  async create(dto: CreateInvoiceDto, actorUserId: string) {
    this.validateAmounts(dto.amountExcludingTax, dto.taxRate, dto.taxAmount, dto.totalAmount);
    const invoice = await this.prisma.invoice.create({
      data: { ...dto, issuedOn: new Date(dto.issuedOn), kind: 'BLUE' },
      include: { project: { select: { projectCode: true, name: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'INVOICE', objectId: invoice.id,
      afterData: { projectId: invoice.projectId, invoiceType: invoice.invoiceType, totalAmount: invoice.totalAmount.toString() },
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
      dto.taxRate ?? before.taxRate.toString(),
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
      beforeData: { projectId: before.projectId, totalAmount: before.totalAmount.toString() },
      afterData: { projectId: invoice.projectId, totalAmount: invoice.totalAmount.toString() },
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

  private validateAmounts(amountExcludingTax: string, taxRate: string, taxAmount: string, totalAmount: string) {
    const rate = Number(taxRate);
    const expected = Number(amountExcludingTax) + Number(taxAmount);
    if ([amountExcludingTax, taxRate, taxAmount, totalAmount].some((value) => Number(value) < 0)) throw new BadRequestException('发票金额和税率不能为负数');
    if (rate > 1) throw new BadRequestException('税率不能超过 100%');
    if (Math.abs(Number(amountExcludingTax) * rate - Number(taxAmount)) > 0.02) throw new BadRequestException('税额必须等于金额乘以税率');
    if (Math.abs(expected - Number(totalAmount)) > 0.02) throw new BadRequestException('价税合计必须等于金额加税额');
  }
}
