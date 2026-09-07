import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DonationReceiptStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import { CreateDonationReceiptDto, DonationReceiptListQueryDto, UpdateDonationReceiptDto } from './donation-receipts.dto';

@Injectable()
export class DonationReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sensitive: SensitiveDataService,
  ) {}

  async list(query: DonationReceiptListQueryDto) {
    if (query.issuedFrom && query.issuedTo && query.issuedFrom > query.issuedTo) {
      throw new BadRequestException('发票日期结束时间不能早于起始时间');
    }
    const where: Prisma.DonationReceiptWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...((query.issuedFrom || query.issuedTo) ? { issuedOn: {
        ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
        ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { donorName: { contains: query.q, mode: 'insensitive' } },
        { invoiceType: { contains: query.q, mode: 'insensitive' } },
        { invoicePlatform: { contains: query.q, mode: 'insensitive' } },
        { sellerName: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const effectiveWhere: Prisma.DonationReceiptWhereInput = { ...where, status: DonationReceiptStatus.NORMAL };
    const [items, total, effectiveCount, totals] = await this.prisma.$transaction([
      this.prisma.donationReceipt.findMany({
        where,
        select: { id: true, donorName: true, phoneMasked: true, issuedOn: true, invoiceType: true, invoicePlatform: true, sellerName: true, totalAmount: true, taxRate: true, amountExcludingTax: true, taxAmount: true, status: true, version: true, createdAt: true, updatedAt: true },
        orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.donationReceipt.count({ where }),
      this.prisma.donationReceipt.count({ where: effectiveWhere }),
      this.prisma.donationReceipt.aggregate({ where: effectiveWhere, _sum: { totalAmount: true } }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'DONATION_RECEIPT', items.map((item) => item.id));
    return {
      items: items.map((item) => ({ ...item, attachments: attachments[item.id] ?? [] })),
      total,
      summary: { amount: Number(totals._sum.totalAmount ?? 0).toFixed(2), count: effectiveCount },
    };
  }

  async create(dto: CreateDonationReceiptDto, actorUserId: string) {
    this.validateText(dto);
    this.validateAmounts(dto.amountExcludingTax, dto.taxRate, dto.taxAmount, dto.totalAmount);
    const receipt = await this.prisma.donationReceipt.create({ data: this.createData(dto) });
    await this.audit.record({ actorUserId, action: 'CREATE', objectType: 'DONATION_RECEIPT', objectId: receipt.id, afterData: this.auditData(receipt) });
    return this.publicRecord(receipt);
  }

  async update(id: string, dto: UpdateDonationReceiptDto, actorUserId: string) {
    const before = await this.findOne(id);
    if (before.status === DonationReceiptStatus.VOID) throw new BadRequestException('已作废捐赠票据不能编辑');
    const values = {
      amountExcludingTax: dto.amountExcludingTax ?? before.amountExcludingTax.toString(),
      taxRate: dto.taxRate ?? before.taxRate.toString(),
      taxAmount: dto.taxAmount ?? before.taxAmount.toString(),
      totalAmount: dto.totalAmount ?? before.totalAmount.toString(),
    };
    this.validateText(dto);
    this.validateAmounts(values.amountExcludingTax, values.taxRate, values.taxAmount, values.totalAmount);
    const receipt = await this.prisma.donationReceipt.update({
      where: { id },
      data: {
        ...(dto.donorName !== undefined ? { donorName: dto.donorName.trim() } : {}),
        ...(dto.phone !== undefined ? { phoneEncrypted: this.sensitive.encrypt(dto.phone.trim()), phoneMasked: this.sensitive.maskPhone(dto.phone.trim()) } : {}),
        ...(dto.issuedOn !== undefined ? { issuedOn: new Date(dto.issuedOn) } : {}),
        ...(dto.invoiceType !== undefined ? { invoiceType: dto.invoiceType.trim() } : {}),
        ...(dto.invoicePlatform !== undefined ? { invoicePlatform: dto.invoicePlatform.trim() } : {}),
        ...(dto.sellerName !== undefined ? { sellerName: dto.sellerName.trim() } : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: dto.totalAmount } : {}),
        ...(dto.taxRate !== undefined ? { taxRate: dto.taxRate } : {}),
        ...(dto.amountExcludingTax !== undefined ? { amountExcludingTax: dto.amountExcludingTax } : {}),
        ...(dto.taxAmount !== undefined ? { taxAmount: dto.taxAmount } : {}),
        version: { increment: 1 },
      },
    });
    await this.audit.record({ actorUserId, action: 'UPDATE', objectType: 'DONATION_RECEIPT', objectId: id, beforeData: this.auditData(before), afterData: this.auditData(receipt) });
    return this.publicRecord(receipt);
  }

  async void(id: string, actorUserId: string) {
    const before = await this.findOne(id);
    if (before.status === DonationReceiptStatus.VOID) throw new BadRequestException('捐赠票据已作废');
    const receipt = await this.prisma.donationReceipt.update({ where: { id }, data: { status: DonationReceiptStatus.VOID, version: { increment: 1 } } });
    await this.audit.record({ actorUserId, action: 'VOID', objectType: 'DONATION_RECEIPT', objectId: id, beforeData: { status: before.status }, afterData: { status: receipt.status } });
    return this.publicRecord(receipt);
  }

  private createData(dto: CreateDonationReceiptDto): Prisma.DonationReceiptCreateInput {
    return {
      donorName: dto.donorName.trim(),
      phoneEncrypted: this.sensitive.encrypt(dto.phone.trim()),
      phoneMasked: this.sensitive.maskPhone(dto.phone.trim()),
      issuedOn: new Date(dto.issuedOn),
      invoiceType: dto.invoiceType.trim(),
      invoicePlatform: dto.invoicePlatform.trim(),
      sellerName: dto.sellerName.trim(),
      totalAmount: dto.totalAmount,
      taxRate: dto.taxRate,
      amountExcludingTax: dto.amountExcludingTax,
      taxAmount: dto.taxAmount,
    };
  }

  private validateText(dto: Partial<CreateDonationReceiptDto>) {
    const values = [['捐赠人', dto.donorName], ['手机号', dto.phone], ['发票类型', dto.invoiceType], ['开票平台', dto.invoicePlatform], ['销售方名称', dto.sellerName]] as const;
    for (const [label, value] of values) if (value !== undefined && !value.trim()) throw new BadRequestException(`${label}不能为空`);
  }

  private validateAmounts(amount: string, rateValue: string, tax: string, total: string) {
    const values = [amount, rateValue, tax, total].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new BadRequestException('发票金额和税率不能为负数');
    const [amountNumber, rate, taxNumber, totalNumber] = values as [number, number, number, number];
    if (rate > 1) throw new BadRequestException('税率不能超过 100%');
    if (Math.abs(amountNumber * rate - taxNumber) > 0.02) throw new BadRequestException('税额必须等于金额乘以税率');
    if (Math.abs(amountNumber + taxNumber - totalNumber) > 0.02) throw new BadRequestException('价税合计必须等于金额加税额');
  }

  private async findOne(id: string) {
    const receipt = await this.prisma.donationReceipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException('捐赠票据不存在');
    return receipt;
  }

  private auditData(receipt: { donorName: string; issuedOn: Date; invoiceType: string; invoicePlatform: string; sellerName: string; totalAmount: Prisma.Decimal; taxRate: Prisma.Decimal; amountExcludingTax: Prisma.Decimal; taxAmount: Prisma.Decimal; status: DonationReceiptStatus }) {
    return { donorName: receipt.donorName, issuedOn: receipt.issuedOn, invoiceType: receipt.invoiceType, invoicePlatform: receipt.invoicePlatform, sellerName: receipt.sellerName, totalAmount: receipt.totalAmount.toString(), taxRate: receipt.taxRate.toString(), amountExcludingTax: receipt.amountExcludingTax.toString(), taxAmount: receipt.taxAmount.toString(), status: receipt.status };
  }

  private publicRecord<T extends { phoneEncrypted?: string | null }>(receipt: T) {
    const { phoneEncrypted: _phoneEncrypted, ...safe } = receipt;
    return safe;
  }
}
