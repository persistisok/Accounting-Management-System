import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceDirection, InvoiceStatus, Prisma } from '@prisma/client';
import { extname } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { normalizeImportDate, parseCsv } from '../common/csv-import';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CreateInvoiceDto, InvoiceListQueryDto, UpdateInvoiceDto } from './invoices.dto';

const importHeaders = ['发票方向', '关联项目编码', '发票日期', '发票类型', '开票平台', '购买方/销售方名称', '价税合计', '税率（%）'] as const;

export interface InvoiceImportFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface InvoiceImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: InvoiceListQueryDto, user?: AuthUser) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(user?.role === 'PM' ? { project: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}),
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

  importTemplate() {
    return Buffer.from(`\uFEFF${importHeaders.join(',')}\r\n`, 'utf8');
  }

  async importInvoices(file: InvoiceImportFile, user: AuthUser): Promise<InvoiceImportResult> {
    if (extname(file.originalname).toLowerCase() !== '.csv') throw new BadRequestException('导入文件必须是 CSV 格式');
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new BadRequestException('导入文件大小必须在 2MB 以内');
    const rows = parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    if (!rows.length) throw new BadRequestException('导入文件为空');
    const headers = rows[0]!.map((value) => value.trim());
    const missingHeaders = importHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) throw new BadRequestException(`导入模板缺少列：${missingHeaders.join('、')}`);
    const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
    if (!dataRows.length) throw new BadRequestException('导入文件没有业务数据');
    if (dataRows.length > 1000) throw new BadRequestException('单次最多导入 1000 行');

    const errors: Array<{ row: number; message: string }> = [];
    let successCount = 0;
    for (let index = 0; index < dataRows.length; index += 1) {
      const rowNumber = index + 2;
      const raw = Object.fromEntries(headers.map((header, column) => [header, dataRows[index]![column]?.trim() ?? '']));
      try {
        const dto = await this.resolveImportRow(raw, user);
        await this.create(dto, user.id, user);
        successCount += 1;
      } catch (error) {
        errors.push({ row: rowNumber, message: importErrorMessage(error) });
      }
    }
    return { total: dataRows.length, successCount, failureCount: errors.length, errors };
  }

  async create(dto: CreateInvoiceDto, actorUserId: string, user?: AuthUser) {
    await this.assertProjectScope(dto.projectId, user);
    this.validateAmounts(dto.amountExcludingTax, dto.taxRate, dto.taxAmount, dto.totalAmount);
    const invoice = await this.prisma.invoice.create({
      data: { ...dto, issuedOn: new Date(dto.issuedOn), kind: 'BLUE' },
      include: { project: { select: { projectCode: true, name: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'INVOICE', objectId: invoice.id,
      afterData: { projectId: invoice.projectId, direction: invoice.direction, invoiceType: invoice.invoiceType, totalAmount: invoice.totalAmount.toString() },
    });
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.invoice.findFirst({ where: { id, ...(user?.role === 'PM' ? { project: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}) } });
    if (!before) throw new NotFoundException('发票不存在');
    if (before.status === 'VOID') throw new BadRequestException('已作废发票不能编辑');
    if (dto.projectId && dto.projectId !== before.projectId) {
      await this.assertProjectScope(dto.projectId, user);
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
      beforeData: { projectId: before.projectId, direction: before.direction, totalAmount: before.totalAmount.toString() },
      afterData: { projectId: invoice.projectId, direction: invoice.direction, totalAmount: invoice.totalAmount.toString() },
    });
    return invoice;
  }

  async void(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.invoice.findFirst({ where: { id, ...(user?.role === 'PM' ? { project: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } : {}) } });
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

  private async resolveImportRow(raw: Record<string, string>, user: AuthUser): Promise<CreateInvoiceDto> {
    const value = (header: typeof importHeaders[number]) => raw[header]?.trim() ?? '';
    const directionLabel = value('发票方向');
    const direction = directionLabel === '已开票' ? InvoiceDirection.ISSUED
      : directionLabel === '已收票' ? InvoiceDirection.RECEIVED : null;
    if (!direction) throw new BadRequestException('发票方向只能填写“已开票”或“已收票”');

    const project = await this.prisma.project.findFirst({
      where: {
        projectCode: requiredInvoiceImportValue(value('关联项目编码'), '关联项目编码', 64),
        status: 'ACTIVE',
        ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      },
      select: { id: true },
    });
    if (!project) throw new BadRequestException('关联项目编码不存在、已结束或不属于当前 PM');

    const totalAmount = value('价税合计');
    if (!/^\d+(?:\.\d{1,2})?$/.test(totalAmount) || Number(totalAmount) <= 0) {
      throw new BadRequestException('价税合计必须为大于零且最多两位小数的数字');
    }
    const taxRatePercent = value('税率（%）');
    if (!/^\d+(?:\.\d{1,4})?$/.test(taxRatePercent) || Number(taxRatePercent) > 100) {
      throw new BadRequestException('税率必须是 0 至 100 之间的数字，且最多四位小数');
    }
    const calculated = calculateInvoiceImportAmounts(totalAmount, taxRatePercent);
    return {
      projectId: project.id,
      direction,
      issuedOn: normalizeImportDate(value('发票日期'), '发票日期'),
      invoiceType: requiredInvoiceImportValue(value('发票类型'), '发票类型', 30),
      invoicePlatform: requiredInvoiceImportValue(value('开票平台'), '开票平台', 100),
      buyerName: requiredInvoiceImportValue(value('购买方/销售方名称'), '购买方/销售方名称', 200),
      amountExcludingTax: calculated.amountExcludingTax,
      taxRate: (Number(taxRatePercent) / 100).toString(),
      taxAmount: calculated.taxAmount,
      totalAmount: Number(totalAmount).toFixed(2),
    };
  }

  private async assertProjectScope(projectId: string, user?: AuthUser) {
    if (user?.role !== 'PM') return;
    const project = await this.prisma.project.findFirst({ where: { id: projectId, pmUserId: user.projectManagerId ?? '__unbound_pm__' }, select: { id: true } });
    if (!project) throw new NotFoundException('关联项目不存在或不属于当前 PM');
  }
}

export function calculateInvoiceImportAmounts(totalAmount: string, taxRatePercent: string) {
  const total = Number(totalAmount);
  const rate = Number(taxRatePercent) / 100;
  const amountExcludingTax = Math.round((total / (1 + rate) + Number.EPSILON) * 100) / 100;
  const taxAmount = Math.round((total - amountExcludingTax + Number.EPSILON) * 100) / 100;
  return { amountExcludingTax: amountExcludingTax.toFixed(2), taxAmount: taxAmount.toFixed(2) };
}

function requiredInvoiceImportValue(value: string, label: string, maxLength: number) {
  if (!value.trim()) throw new BadRequestException(`${label}不能为空`);
  if (value.trim().length > maxLength) throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
  return value.trim();
}

function importErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '导入失败';
}
