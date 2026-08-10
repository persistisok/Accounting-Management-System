import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveStatus, ContractStatus, InvoiceDirection, InvoiceStatus, Prisma, ProjectReviewState, ProjectStatus } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import type { AuthUser } from '../common/current-user.decorator';
import { roundMoney } from '../common/money';
import { PrismaService } from '../prisma.service';
import { CreateProjectDto, ProjectListQueryDto, ProjectPeriodUnit, UpdateProjectDto } from './projects.dto';
import { ProjectReviewDecision } from './projects.dto';

export interface FinancialSummary {
  receivableAmount: string;
  receivedAmount: string;
  invoicedAmount: string;
  receivedInvoiceAmount: string;
  payableExecutionAmount: string;
  paidExecutionAmount: string;
  paidExpertAmount: string;
  unreceivedAmount: string;
  uninvoicedAmount: string;
  unpaidExecutionAmount: string;
}

const emptySummary = (): FinancialSummary => ({
  receivableAmount: '0.00', receivedAmount: '0.00', invoicedAmount: '0.00', receivedInvoiceAmount: '0.00',
  payableExecutionAmount: '0.00', paidExecutionAmount: '0.00', paidExpertAmount: '0.00',
  unreceivedAmount: '0.00', uninvoicedAmount: '0.00', unpaidExecutionAmount: '0.00',
});

const reviewRelations = {
  statusRequester: { select: { id: true, displayName: true } },
  statusReviewer: { select: { id: true, displayName: true } },
  archiveRequester: { select: { id: true, displayName: true } },
  archiveReviewer: { select: { id: true, displayName: true } },
} satisfies Prisma.ProjectInclude;

export function formatProjectCode(platformAbbreviation: string, year: number, month: number, sequence: number, suffix = randomProjectCodeSuffix()) {
  const shortYear = String(year % 100).padStart(2, '0');
  return `${platformAbbreviation.toUpperCase()}${shortYear}${String(month).padStart(2, '0')}${String(sequence).padStart(2, '0')}${suffix}`;
}

export function randomProjectCodeSuffix() {
  return Array.from({ length: 5 }, () => String.fromCharCode(65 + randomInt(26))).join('');
}

export function toPeriodMonths(value: string, unit: ProjectPeriodUnit) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1200) {
    throw new BadRequestException('项目周期必须是 1 至 1200 之间的整数');
  }
  const months = unit === ProjectPeriodUnit.YEAR ? amount * 12 : amount;
  if (months > 1200) throw new BadRequestException('项目周期不能超过 1200 月');
  return months;
}

export function buildProjectWhere(query: ProjectListQueryDto): Prisma.ProjectWhereInput {
  if (query.publishedFrom && query.publishedTo
    && new Date(query.publishedFrom).getTime() > new Date(query.publishedTo).getTime()) {
    throw new BadRequestException('立项开始日期不能晚于结束日期');
  }
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.platform ? { platform: query.platform } : {}),
    ...(query.nature ? { nature: query.nature } : {}),
    ...(query.projectType ? { projectType: query.projectType } : {}),
    ...((query.publishedFrom || query.publishedTo) ? {
      publishedOn: {
        ...(query.publishedFrom ? { gte: new Date(query.publishedFrom) } : {}),
        ...(query.publishedTo ? { lte: new Date(query.publishedTo) } : {}),
      },
    } : {}),
    ...(query.q ? {
      OR: [
        { projectCode: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { platform: { contains: query.q, mode: 'insensitive' } },
        { pmName: { contains: query.q, mode: 'insensitive' } },
      ],
    } : {}),
  };
}

export function projectScopeFor(user: Pick<AuthUser, 'role' | 'projectManagerId'>): Prisma.ProjectWhereInput {
  return user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {};
}

export function validateStatusRequest(current: ProjectStatus, reviewState: ProjectReviewState | null, requested: ProjectStatus) {
  if (current !== ProjectStatus.ACTIVE) throw new BadRequestException('只有进行中的项目可以申请结项或中止');
  if (requested !== ProjectStatus.CLOSED && requested !== ProjectStatus.ABORTED) {
    throw new BadRequestException('项目状态只能申请为已结项或已中止');
  }
  if (reviewState === ProjectReviewState.PENDING) throw new BadRequestException('该项目已有待复核的状态申请');
}

export function validateArchiveRequest(status: ProjectStatus, archiveStatus: ArchiveStatus, reviewState: ProjectReviewState | null) {
  if (status === ProjectStatus.ACTIVE) throw new BadRequestException('项目结项或中止后才能申请归档');
  if (archiveStatus === ArchiveStatus.ARCHIVED) throw new BadRequestException('该项目已归档');
  if (reviewState === ProjectReviewState.PENDING) throw new BadRequestException('该项目已有待复核的归档申请');
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProjectListQueryDto, user: AuthUser) {
    const where = { ...buildProjectWhere(query), ...projectScopeFor(user) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: { pm: { select: { id: true, displayName: true } }, ...reviewRelations },
        orderBy: [{ status: 'asc' }, { publishedOn: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    const ids = items.map((item) => item.id);
    const [summaries, attachments] = await Promise.all([
      this.summaries(ids),
      attachmentMap(this.prisma, 'PROJECT', ids),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        financialSummary: summaries[item.id] ?? emptySummary(),
        attachments: attachments[item.id] ?? [],
      })),
      total,
    };
  }

  async options(user: AuthUser) {
    return this.prisma.project.findMany({
      where: { status: 'ACTIVE', ...projectScopeFor(user) },
      select: { id: true, projectCode: true, name: true },
      orderBy: [{ publishedOn: 'desc' }, { projectCode: 'desc' }],
    });
  }

  async filterOptions(user: AuthUser) {
    const where = projectScopeFor(user);
    const [platforms, natures, projectTypes] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, distinct: ['platform'], select: { platform: true }, orderBy: { platform: 'asc' } }),
      this.prisma.project.findMany({ where, distinct: ['nature'], select: { nature: true }, orderBy: { nature: 'asc' } }),
      this.prisma.project.findMany({ where, distinct: ['projectType'], select: { projectType: true }, orderBy: { projectType: 'asc' } }),
    ]);
    return {
      platforms: platforms.map((item) => item.platform),
      natures: natures.map((item) => item.nature),
      projectTypes: projectTypes.map((item) => item.projectType),
    };
  }

  async findOne(id: string, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...projectScopeFor(user) },
      include: {
        pm: { select: { id: true, displayName: true } },
        ...reviewRelations,
        contracts: { include: { counterparty: true }, orderBy: { signedOn: 'desc' } },
        invoices: { orderBy: { issuedOn: 'desc' } },
        allocations: {
          include: { bankTransaction: true, expertProfile: { include: { person: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    const [financialSummary, attachments] = await Promise.all([
      this.summaries([id]).then((summaries) => summaries[id] ?? emptySummary()),
      attachmentMap(this.prisma, 'PROJECT', [id]),
    ]);
    return { ...project, financialSummary, attachments: attachments[id] ?? [] };
  }

  async create(dto: CreateProjectDto, actorUserId: string, user?: AuthUser) {
    const { periodValue, periodUnit, pmUserId: requestedPmId, platformAbbreviation: requestedAbbreviation, ...projectData } = dto;
    const pmUserId = user?.role === 'PM' ? user.projectManagerId : requestedPmId;
    if (!pmUserId) throw new BadRequestException('PM 账号必须绑定 PM');
    const pm = await this.findActivePm(pmUserId);
    const periodMonths = toPeriodMonths(periodValue, periodUnit);
    const platformAbbreviation = requestedAbbreviation.toUpperCase();
    const publishedOn = new Date(dto.publishedOn);
    const year = publishedOn.getUTCFullYear();
    const month = publishedOn.getUTCMonth() + 1;
    const project = await this.prisma.$transaction(async (transaction) => {
      const counter = await transaction.projectCodeCounter.upsert({
        where: { platformAbbreviation_year_month: { platformAbbreviation, year, month } },
        create: { platformAbbreviation, year, month, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      const projectCode = formatProjectCode(platformAbbreviation, year, month, counter.nextNumber - 1);
      return transaction.project.create({
        data: {
          ...projectData,
          platformAbbreviation,
          pmName: pm.displayName,
          periodMonths,
          pmUserId,
          projectCode,
          publishedOn,
          status: ProjectStatus.ACTIVE,
        },
        include: { pm: { select: { id: true, displayName: true } } },
      });
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'PROJECT', objectId: project.id,
      afterData: { projectCode: project.projectCode, name: project.name },
    });
    return { ...project, financialSummary: emptySummary(), attachments: [] };
  }

  async update(id: string, dto: UpdateProjectDto, actorUserId: string, user?: AuthUser) {
    const { periodValue, periodUnit, pmUserId, ...projectData } = dto;
    const before = await this.prisma.project.findFirst({ where: { id, ...(user ? projectScopeFor(user) : {}) } });
    if (!before) throw new NotFoundException('项目不存在');
    if (before.archiveStatus === ArchiveStatus.ARCHIVED) throw new BadRequestException('已归档项目不能编辑');
    if ((periodValue === undefined) !== (periodUnit === undefined)) throw new BadRequestException('项目周期数值和单位必须同时填写');
    const periodMonths = periodValue && periodUnit ? toPeriodMonths(periodValue, periodUnit) : undefined;
    const effectivePmId = user?.role === 'PM' ? user.projectManagerId : pmUserId;
    const pm = effectivePmId ? await this.findActivePm(effectivePmId) : undefined;
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...projectData,
        ...(pm ? { pmName: pm.displayName, pmUserId: pm.id } : {}),
        ...(periodMonths ? { periodMonths } : {}),
        ...(dto.publishedOn ? { publishedOn: new Date(dto.publishedOn) } : {}),
        version: { increment: 1 },
      },
      include: { pm: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'PROJECT', objectId: id,
      beforeData: { name: before.name, status: before.status },
      afterData: { name: project.name, status: project.status },
    });
    const [financialSummary, attachments] = await Promise.all([
      this.summary(id),
      attachmentMap(this.prisma, 'PROJECT', [id]),
    ]);
    return { ...project, financialSummary, attachments: attachments[id] ?? [] };
  }

  async requestStatus(id: string, status: ProjectStatus, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...projectScopeFor(user) },
      select: { id: true, status: true, statusReviewState: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    validateStatusRequest(project.status, project.statusReviewState, status);
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        requestedStatus: status,
        statusReviewState: ProjectReviewState.PENDING,
        statusRequestedById: user.id,
        statusRequestedAt: new Date(),
        statusReviewerId: null,
        statusReviewedAt: null,
        version: { increment: 1 },
      },
      include: reviewRelations,
    });
    await this.audit.record({
      actorUserId: user.id, action: 'REQUEST_STATUS_REVIEW', objectType: 'PROJECT', objectId: id,
      afterData: { requestedStatus: status },
    });
    return updated;
  }

  async reviewStatus(id: string, decision: ProjectReviewDecision, reviewerId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { status: true, requestedStatus: true, statusReviewState: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.statusReviewState !== ProjectReviewState.PENDING || !project.requestedStatus) {
      throw new BadRequestException('该项目没有待复核的状态申请');
    }
    const approved = decision === ProjectReviewDecision.APPROVED;
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(approved ? { status: project.requestedStatus } : {}),
        statusReviewState: approved ? ProjectReviewState.APPROVED : ProjectReviewState.REJECTED,
        statusReviewerId: reviewerId,
        statusReviewedAt: new Date(),
        version: { increment: 1 },
      },
      include: reviewRelations,
    });
    await this.audit.record({
      actorUserId: reviewerId, action: 'REVIEW_PROJECT_STATUS', objectType: 'PROJECT', objectId: id,
      beforeData: { status: project.status },
      afterData: { decision, requestedStatus: project.requestedStatus, status: updated.status },
    });
    return updated;
  }

  async requestArchive(id: string, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...projectScopeFor(user) },
      select: { id: true, status: true, archiveStatus: true, archiveReviewState: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    validateArchiveRequest(project.status, project.archiveStatus, project.archiveReviewState);
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        requestedArchiveStatus: ArchiveStatus.ARCHIVED,
        archiveReviewState: ProjectReviewState.PENDING,
        archiveRequestedById: user.id,
        archiveRequestedAt: new Date(),
        archiveReviewerId: null,
        archiveReviewedAt: null,
        version: { increment: 1 },
      },
      include: reviewRelations,
    });
    await this.audit.record({
      actorUserId: user.id, action: 'REQUEST_ARCHIVE_REVIEW', objectType: 'PROJECT', objectId: id,
      afterData: { requestedArchiveStatus: ArchiveStatus.ARCHIVED },
    });
    return updated;
  }

  async reviewArchive(id: string, decision: ProjectReviewDecision, reviewerId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { archiveStatus: true, requestedArchiveStatus: true, archiveReviewState: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.archiveReviewState !== ProjectReviewState.PENDING || !project.requestedArchiveStatus) {
      throw new BadRequestException('该项目没有待复核的归档申请');
    }
    const approved = decision === ProjectReviewDecision.APPROVED;
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(approved ? { archiveStatus: project.requestedArchiveStatus } : {}),
        archiveReviewState: approved ? ProjectReviewState.APPROVED : ProjectReviewState.REJECTED,
        archiveReviewerId: reviewerId,
        archiveReviewedAt: new Date(),
        version: { increment: 1 },
      },
      include: reviewRelations,
    });
    await this.audit.record({
      actorUserId: reviewerId, action: 'REVIEW_PROJECT_ARCHIVE', objectType: 'PROJECT', objectId: id,
      beforeData: { archiveStatus: project.archiveStatus },
      afterData: { decision, archiveStatus: updated.archiveStatus },
    });
    return updated;
  }

  async timeline(id: string, user: AuthUser) {
    const project = await this.findOne(id, user);
    const events = [
      { id: `project-${id}`, date: project.publishedOn, type: 'PROJECT', label: '项目立项', amount: project.approvedAmount },
      ...project.contracts.map((item) => ({
        id: item.id, date: item.signedOn, type: 'CONTRACT',
        label: item.contractType === 'SUPPORT' ? '支持协议' : '执行协议', amount: item.amount,
      })),
      ...project.allocations.filter((item) => item.status === 'CONFIRMED').map((item) => ({
        id: item.id, date: item.bankTransaction.transactionAt, type: 'PAYMENT',
        label: item.category === 'SUPPORT_RECEIPT' ? '收到支持款' : item.category === 'EXPERT_FEE' ? '支付专家费' : '支付执行款',
        amount: item.allocatedAmount,
      })),
      ...project.invoices.filter((item) => item.status === 'NORMAL').map((item) => ({
        id: item.id, date: item.issuedOn, type: 'INVOICE',
        label: item.kind === 'RED' ? '红字发票' : item.direction === InvoiceDirection.RECEIVED ? '收到发票' : '开具发票',
        amount: item.totalAmount,
      })),
    ];
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async summary(projectId: string, user?: AuthUser) {
    if (user) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, ...projectScopeFor(user) },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('项目不存在');
    }
    const result = await this.summaries([projectId]);
    return result[projectId] ?? emptySummary();
  }

  private async summaries(projectIds: string[]): Promise<Record<string, FinancialSummary>> {
    if (projectIds.length === 0) return {};
    const [contracts, allocations, invoices] = await Promise.all([
      this.prisma.contract.findMany({
        where: { projectId: { in: projectIds }, status: ContractStatus.SIGNED },
        select: { projectId: true, contractType: true, amount: true },
      }),
      this.prisma.bankAllocation.findMany({
        where: { projectId: { in: projectIds }, status: 'CONFIRMED' },
        select: { projectId: true, category: true, allocatedAmount: true },
      }),
      this.prisma.invoice.findMany({
        where: { projectId: { in: projectIds }, status: InvoiceStatus.NORMAL },
        select: { projectId: true, direction: true, kind: true, totalAmount: true },
      }),
    ]);
    const numeric: Record<string, Record<string, number>> = {};
    for (const id of projectIds) numeric[id] = {};
    for (const item of contracts) {
      const key = item.contractType === 'SUPPORT' ? 'receivable' : item.contractType === 'EXECUTION' ? 'payable' : null;
      if (key) numeric[item.projectId]![key] = (numeric[item.projectId]![key] ?? 0) + Number(item.amount);
    }
    for (const item of allocations) {
      if (!item.projectId) continue;
      const key = item.category === 'SUPPORT_RECEIPT' ? 'received'
        : item.category === 'EXECUTION_PAYMENT' ? 'paidExecution'
          : item.category === 'EXPERT_FEE' ? 'paidExpert' : null;
      if (key) numeric[item.projectId]![key] = (numeric[item.projectId]![key] ?? 0) + Number(item.allocatedAmount);
    }
    for (const item of invoices) {
      const key = item.direction === InvoiceDirection.RECEIVED ? 'receivedInvoice' : 'invoiced';
      numeric[item.projectId]![key] = (numeric[item.projectId]![key] ?? 0)
        + Number(item.totalAmount) * (item.kind === 'RED' ? -1 : 1);
    }
    return Object.fromEntries(projectIds.map((id) => {
      const row = numeric[id] ?? {};
      const receivable = row.receivable ?? 0;
      const received = row.received ?? 0;
      const invoiced = row.invoiced ?? 0;
      const payable = row.payable ?? 0;
      const paidExecution = row.paidExecution ?? 0;
      return [id, {
        receivableAmount: roundMoney(receivable),
        receivedAmount: roundMoney(received),
        invoicedAmount: roundMoney(invoiced),
        receivedInvoiceAmount: roundMoney(row.receivedInvoice ?? 0),
        payableExecutionAmount: roundMoney(payable),
        paidExecutionAmount: roundMoney(paidExecution),
        paidExpertAmount: roundMoney(row.paidExpert ?? 0),
        unreceivedAmount: roundMoney(receivable - received),
        uninvoicedAmount: roundMoney(received - invoiced),
        unpaidExecutionAmount: roundMoney(payable - paidExecution),
      }];
    }));
  }

  private async findActivePm(id: string) {
    const projectManager = await this.prisma.projectManager.findFirst({
      where: { id, displayName: { not: '' }, status: 'ACTIVE' },
      select: { id: true, displayName: true },
    });
    if (!projectManager) throw new BadRequestException('请选择有效的 PM');
    return projectManager;
  }

}
