import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceCategory, InvoiceCollectionStatus, InvoiceDirection, InvoiceStatus, Prisma } from '@prisma/client';
import { extname } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { normalizeImportDate, parseCsv } from '../common/csv-import';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CreateInvoiceDto, InvoiceListQueryDto, UpdateInvoiceDto } from './invoices.dto';

const commonImportHeaders = ['发票日期', '发票类型', '开票平台', '购买方/销售方名称', '价税合计', '税率（%）'] as const;

export interface InvoiceImportFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface InvoiceImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  collectedCount: number;
  pendingCount: number;
  errors: Array<{ row: number; message: string }>;
}

interface ResolvedInvoiceImport {
  dto: CreateInvoiceDto;
  payerName?: string;
  collectionStatus?: InvoiceCollectionStatus;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  memberOptions(user?: AuthUser) {
    if (user?.role === 'EXTERNAL') return [];
    return this.prisma.membership.findMany({
      where: { status: 'ACTIVE', ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
      select: { id: true, memberName: true, memberType: true, committee: { select: { id: true, committeeCode: true, name: true } } },
      orderBy: { memberName: 'asc' },
    });
  }

  async list(query: InvoiceListQueryDto, user?: AuthUser) {
    this.validateDateRange(query.issuedFrom, query.issuedTo);
    const where: Prisma.InvoiceWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.membershipId ? { membershipId: query.membershipId } : {}),
      ...(query.committeeId ? { membership: { committeeId: query.committeeId } } : {}),
      ...(query.expertProfileId ? { expertProfileId: query.expertProfileId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.collectionStatus ? { collectionStatus: query.collectionStatus } : {}),
      ...((query.issuedFrom || query.issuedTo) ? { issuedOn: {
        ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
        ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
      } } : {}),
      ...invoiceScopeFor(user),
      ...(query.q ? { OR: [
        { invoiceType: { contains: query.q, mode: 'insensitive' } },
        { invoicePlatform: { contains: query.q, mode: 'insensitive' } },
        { buyerName: { contains: query.q, mode: 'insensitive' } },
        { payerName: { contains: query.q, mode: 'insensitive' } },
        { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
        { project: { name: { contains: query.q, mode: 'insensitive' } } },
        { membership: { memberName: { contains: query.q, mode: 'insensitive' } } },
        { expertProfile: { person: { name: { contains: query.q, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [items, total, summary, collectedMembers, pendingCount] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          membership: { select: { id: true, memberName: true, memberType: true, committee: { select: { id: true, committeeCode: true, name: true } } } },
          expertProfile: { select: { id: true, person: { select: { name: true, organizationName: true } } } },
        },
        orderBy: { issuedOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({ where, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.invoice.findMany({
        where: { AND: [where, { membershipId: { not: null }, collectionStatus: InvoiceCollectionStatus.COLLECTED }] },
        distinct: ['membershipId'],
        select: { membershipId: true },
      }),
      this.prisma.invoice.count({ where: { AND: [where, { collectionStatus: InvoiceCollectionStatus.PENDING }] } }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'INVOICE', items.map((item) => item.id));
    return {
      items: items.map((item) => ({ ...item, attachments: attachments[item.id] ?? [] })),
      total,
      summary: {
        count: summary._count._all,
        totalAmount: summary._sum.totalAmount?.toFixed(2) ?? '0.00',
        collectedMemberCount: query.category === InvoiceCategory.MEMBER_DUE_ISSUED ? collectedMembers.length : 0,
        pendingCount: query.category === InvoiceCategory.MEMBER_DUE_ISSUED ? pendingCount : 0,
      },
    };
  }

  importTemplate(category: InvoiceCategory) {
    return Buffer.from(`\uFEFF${this.importHeaders(category).join(',')}\r\n`, 'utf8');
  }

  async importInvoices(file: InvoiceImportFile, user: AuthUser, category: InvoiceCategory): Promise<InvoiceImportResult> {
    if (extname(file.originalname).toLowerCase() !== '.csv') throw new BadRequestException('导入文件必须是 CSV 格式');
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new BadRequestException('导入文件大小必须在 2MB 以内');
    const rows = parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    if (!rows.length) throw new BadRequestException('导入文件为空');
    const headers = rows[0]!.map((value) => value.trim());
    const expectedHeaders = this.importHeaders(category);
    const missingHeaders = expectedHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) throw new BadRequestException(`导入模板缺少列：${missingHeaders.join('、')}`);
    const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
    if (!dataRows.length) throw new BadRequestException('导入文件没有业务数据');
    if (dataRows.length > 1000) throw new BadRequestException('单次最多导入 1000 行');

    const errors: Array<{ row: number; message: string }> = [];
    let successCount = 0;
    let collectedCount = 0;
    let pendingCount = 0;
    for (let index = 0; index < dataRows.length; index += 1) {
      const rowNumber = index + 2;
      const raw = Object.fromEntries(headers.map((header, column) => [header, dataRows[index]![column]?.trim() ?? '']));
      try {
        const resolved = await this.resolveImportRow(raw, user, category);
        await this.create(resolved.dto, user.id, user, {
          allowPendingCollection: resolved.collectionStatus === InvoiceCollectionStatus.PENDING,
          payerName: resolved.payerName,
        });
        successCount += 1;
        if (resolved.collectionStatus === InvoiceCollectionStatus.COLLECTED) collectedCount += 1;
        if (resolved.collectionStatus === InvoiceCollectionStatus.PENDING) pendingCount += 1;
      } catch (error) {
        errors.push({ row: rowNumber, message: importErrorMessage(error) });
      }
    }
    return { total: dataRows.length, successCount, failureCount: errors.length, collectedCount, pendingCount, errors };
  }

  async create(dto: CreateInvoiceDto, actorUserId: string, user?: AuthUser, importOptions?: { allowPendingCollection?: boolean; payerName?: string }) {
    await this.assertInvoiceReference(dto.category, dto.projectId, dto.membershipId, dto.expertProfileId, user, importOptions?.allowPendingCollection);
    this.validateAmounts(dto.amountExcludingTax, dto.taxRate, dto.taxAmount, dto.totalAmount);
    const direction = directionForCategory(dto.category);
    const isMemberInvoice = dto.category === InvoiceCategory.MEMBER_DUE_ISSUED;
    const collectionStatus = isMemberInvoice
      ? dto.membershipId ? InvoiceCollectionStatus.COLLECTED : InvoiceCollectionStatus.PENDING
      : InvoiceCollectionStatus.NOT_APPLICABLE;
    const invoice = await this.prisma.invoice.create({
      data: {
        ...dto,
        direction,
        issuedOn: new Date(dto.issuedOn),
        kind: 'BLUE',
        collectionStatus,
        payerName: isMemberInvoice ? importOptions?.payerName : undefined,
        collectedAt: collectionStatus === InvoiceCollectionStatus.COLLECTED ? new Date() : undefined,
        collectedById: collectionStatus === InvoiceCollectionStatus.COLLECTED ? actorUserId : undefined,
      },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        membership: { select: { id: true, memberName: true, memberType: true, committee: { select: { id: true, committeeCode: true, name: true } } } },
        expertProfile: { select: { id: true, person: { select: { name: true, organizationName: true } } } },
      },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'INVOICE', objectId: invoice.id,
      afterData: { projectId: invoice.projectId, membershipId: invoice.membershipId, expertProfileId: invoice.expertProfileId, category: invoice.category, direction: invoice.direction, invoiceType: invoice.invoiceType, totalAmount: invoice.totalAmount.toString() },
    });
    return invoice;
  }

  async collectMemberInvoice(id: string, membershipId: string, actorUserId: string) {
    const before = await this.prisma.invoice.findFirst({ where: { id, category: InvoiceCategory.MEMBER_DUE_ISSUED } });
    if (!before) throw new NotFoundException('会费收入票据不存在');
    if (before.status === InvoiceStatus.VOID) throw new BadRequestException('已作废票据不能归集');
    if (before.collectionStatus !== InvoiceCollectionStatus.PENDING) throw new BadRequestException('该票据已完成归集');
    const member = await this.prisma.membership.findFirst({ where: { id: membershipId, status: 'ACTIVE' }, select: { id: true } });
    if (!member) throw new NotFoundException('关联会员不存在或已停用');
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        membershipId,
        collectionStatus: InvoiceCollectionStatus.COLLECTED,
        collectedById: actorUserId,
        collectedAt: new Date(),
        version: { increment: 1 },
      },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        membership: { select: { id: true, memberName: true, memberType: true, committee: { select: { id: true, committeeCode: true, name: true } } } },
      },
    });
    await this.audit.record({
      actorUserId,
      action: 'COLLECT',
      objectType: 'INVOICE',
      objectId: id,
      beforeData: { membershipId: before.membershipId, collectionStatus: before.collectionStatus },
      afterData: { membershipId, collectionStatus: invoice.collectionStatus },
    });
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.invoice.findFirst({ where: { id, ...invoiceScopeFor(user) } });
    if (!before) throw new NotFoundException('发票不存在');
    if (before.status === 'VOID') throw new BadRequestException('已作废发票不能编辑');
    if (before.collectionStatus === InvoiceCollectionStatus.PENDING) throw new BadRequestException('待归集票据请先完成归集确认');
    if (dto.category && dto.category !== before.category) throw new BadRequestException('不能修改发票业务分类');
    const category = before.category;
    const projectId = dto.projectId === null ? undefined : dto.projectId ?? before.projectId ?? undefined;
    const membershipId = dto.membershipId ?? before.membershipId ?? undefined;
    const expertProfileId = dto.expertProfileId ?? before.expertProfileId ?? undefined;
    await this.assertInvoiceReference(category, projectId, membershipId, expertProfileId, user);
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
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        membership: { select: { id: true, memberName: true, memberType: true, committee: { select: { id: true, committeeCode: true, name: true } } } },
        expertProfile: { select: { id: true, person: { select: { name: true, organizationName: true } } } },
      },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'INVOICE', objectId: id,
      beforeData: { projectId: before.projectId, membershipId: before.membershipId, expertProfileId: before.expertProfileId, category: before.category, totalAmount: before.totalAmount.toString() },
      afterData: { projectId: invoice.projectId, membershipId: invoice.membershipId, expertProfileId: invoice.expertProfileId, category: invoice.category, totalAmount: invoice.totalAmount.toString() },
    });
    return invoice;
  }

  async void(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.invoice.findFirst({ where: { id, ...invoiceScopeFor(user) } });
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

  private async resolveImportRow(raw: Record<string, string>, user: AuthUser, category: InvoiceCategory): Promise<ResolvedInvoiceImport> {
    const value = (header: string) => raw[header]?.trim() ?? '';
    let projectId: string | undefined;
    let membershipId: string | undefined;
    let expertProfileId: string | undefined;
    let payerName: string | undefined;
    let collectionStatus: InvoiceCollectionStatus | undefined;
    if (category === InvoiceCategory.MEMBER_DUE_ISSUED) {
      payerName = requiredInvoiceImportValue(value('交款人姓名'), '交款人姓名', 200);
      const members = await this.prisma.membership.findMany({
        where: { memberName: payerName, status: 'ACTIVE', ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
        select: { id: true }, take: 2,
      });
      if (members.length === 1) {
        membershipId = members[0]!.id;
        collectionStatus = InvoiceCollectionStatus.COLLECTED;
      } else {
        collectionStatus = InvoiceCollectionStatus.PENDING;
      }
      const projectCode = value('关联项目编码（可选）');
      if (projectCode) {
        const project = await this.prisma.project.findFirst({
          where: {
            projectCode,
            ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : user.role === 'EXTERNAL' ? { id: { in: user.projectIds } } : {}),
          },
          select: { id: true },
        });
        if (!project) throw new BadRequestException('关联项目编码不存在或不在当前账号范围内');
        projectId = project.id;
      }
    } else {
      const project = await this.prisma.project.findFirst({
        where: {
          projectCode: requiredInvoiceImportValue(value('关联项目编码'), '关联项目编码', 64),
          ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : user.role === 'EXTERNAL' ? { id: { in: user.projectIds } } : {}),
        },
        select: { id: true },
      });
      if (!project) throw new BadRequestException('关联项目编码不存在或不在当前账号范围内');
      projectId = project.id;
      if (category === InvoiceCategory.EXPERT_FEE_RECEIVED) {
        const expertName = requiredInvoiceImportValue(value('专家姓名'), '专家姓名', 100);
        const experts = await this.prisma.expertProfile.findMany({
          where: {
            reviewStatus: 'APPROVED', status: 'ACTIVE', person: { name: expertName },
            ...(user.role === 'PM' ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } : {}),
          },
          select: { id: true }, take: 2,
        });
        if (!experts.length) throw new BadRequestException('专家不存在、未通过复核或不在当前账号范围内');
        if (experts.length > 1) throw new BadRequestException('存在同名专家，请改为逐笔登记');
        expertProfileId = experts[0]!.id;
      }
    }

    const totalAmount = value('价税合计');
    if (!/^\d+(?:\.\d{1,2})?$/.test(totalAmount) || Number(totalAmount) <= 0) {
      throw new BadRequestException('价税合计必须为大于零且最多两位小数的数字');
    }
    const taxRatePercent = value('税率（%）');
    if (!/^\d+(?:\.\d{1,4})?$/.test(taxRatePercent) || Number(taxRatePercent) > 100) {
      throw new BadRequestException('税率必须是 0 至 100 之间的数字，且最多四位小数');
    }
    const calculated = calculateInvoiceImportAmounts(totalAmount, taxRatePercent);
    return { dto: {
      projectId,
      membershipId,
      expertProfileId,
      category,
      issuedOn: normalizeImportDate(value('发票日期'), '发票日期'),
      invoiceType: requiredInvoiceImportValue(value('发票类型'), '发票类型', 30),
      invoicePlatform: requiredInvoiceImportValue(value('开票平台'), '开票平台', 100),
      buyerName: category === InvoiceCategory.MEMBER_DUE_ISSUED
        ? payerName!
        : requiredInvoiceImportValue(value('购买方/销售方名称'), '购买方/销售方名称', 200),
      amountExcludingTax: calculated.amountExcludingTax,
      taxRate: (Number(taxRatePercent) / 100).toString(),
      taxAmount: calculated.taxAmount,
      totalAmount: Number(totalAmount).toFixed(2),
    }, payerName, collectionStatus };
  }

  private async assertInvoiceReference(category: InvoiceCategory, projectId?: string, membershipId?: string, expertProfileId?: string, user?: AuthUser, allowPendingCollection = false) {
    if (category === InvoiceCategory.MEMBER_DUE_ISSUED) {
      if ((!membershipId && !allowPendingCollection) || expertProfileId) throw new BadRequestException('会费收入票据必须关联会员，不能关联专家');
      if (user?.role === 'EXTERNAL') throw new BadRequestException('第三方外部账号不能登记会费收入票据');
      if (membershipId) {
        const member = await this.prisma.membership.findFirst({
          where: { id: membershipId, status: 'ACTIVE', ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
          select: { id: true },
        });
        if (!member) throw new NotFoundException('关联会员不存在或不在当前账号范围内');
      }
      if (projectId) {
        const project = await this.prisma.project.findFirst({
          where: {
            id: projectId,
            ...(user?.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
          },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('关联项目不存在或不在当前账号范围内');
      }
      return;
    }
    const isExpertInvoice = category === InvoiceCategory.EXPERT_FEE_RECEIVED;
    if (!projectId || membershipId || (isExpertInvoice ? !expertProfileId : Boolean(expertProfileId))) {
      throw new BadRequestException(isExpertInvoice ? '专家费支出票据必须关联项目和专家' : '该类票据必须关联项目，不能关联会员或专家');
    }
    if (user?.role === 'PM' || user?.role === 'EXTERNAL') {
      const project = await this.prisma.project.findFirst({
        where: user.role === 'PM'
          ? { id: projectId, pmUserId: user.projectManagerId ?? '__unbound_pm__' }
          : { id: projectId, AND: { id: { in: user.projectIds } } },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('关联项目不存在或不在当前账号授权范围内');
    }
    if (isExpertInvoice) {
      const expert = await this.prisma.expertProfile.findFirst({
        where: {
          id: expertProfileId, reviewStatus: 'APPROVED', status: 'ACTIVE',
          ...(user?.role === 'PM' ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } : {}),
        },
        select: { id: true },
      });
      if (!expert) throw new NotFoundException('关联专家不存在、未通过复核或不在当前账号范围内');
    }
  }

  private importHeaders(category: InvoiceCategory) {
    if (category === InvoiceCategory.MEMBER_DUE_ISSUED) return ['交款人姓名', '关联项目编码（可选）', ...commonImportHeaders.filter((header) => header !== '购买方/销售方名称')];
    if (category === InvoiceCategory.EXPERT_FEE_RECEIVED) return ['关联项目编码', '专家姓名', ...commonImportHeaders];
    return ['关联项目编码', ...commonImportHeaders];
  }

  private validateDateRange(from?: string, to?: string) {
    if (from && to && from > to) throw new BadRequestException('发票日期结束时间不能早于起始时间');
  }
}

function invoiceScopeFor(user?: AuthUser): Prisma.InvoiceWhereInput {
  if (user?.role === 'PM') return { AND: [{ OR: [
    { project: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } },
    { membership: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } },
  ] }] };
  if (user?.role === 'EXTERNAL') return { projectId: { in: user.projectIds } };
  return {};
}

export function directionForCategory(category: InvoiceCategory) {
  return category === InvoiceCategory.SUPPORT_RECEIPT_ISSUED || category === InvoiceCategory.MEMBER_DUE_ISSUED
    ? InvoiceDirection.ISSUED : InvoiceDirection.RECEIVED;
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
