import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, InvoiceStatus, Prisma, ProjectStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { roundMoney } from '../common/money';
import { PrismaService } from '../prisma.service';
import { CreateProjectDto, ProjectListQueryDto, ProjectPeriodUnit, UpdateProjectDto } from './projects.dto';

export interface FinancialSummary {
  receivableAmount: string;
  receivedAmount: string;
  invoicedAmount: string;
  payableExecutionAmount: string;
  paidExecutionAmount: string;
  paidExpertAmount: string;
  unreceivedAmount: string;
  uninvoicedAmount: string;
  unpaidExecutionAmount: string;
}

const emptySummary = (): FinancialSummary => ({
  receivableAmount: '0.00', receivedAmount: '0.00', invoicedAmount: '0.00',
  payableExecutionAmount: '0.00', paidExecutionAmount: '0.00', paidExpertAmount: '0.00',
  unreceivedAmount: '0.00', uninvoicedAmount: '0.00', unpaidExecutionAmount: '0.00',
});

export function formatProjectCode(year: number, sequence: number) {
  return `PRJ-${year}-${String(sequence).padStart(3, '0')}`;
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

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProjectListQueryDto) {
    const where: Prisma.ProjectWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? {
        OR: [
          { projectCode: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
          { platform: { contains: query.q, mode: 'insensitive' } },
          { pmName: { contains: query.q, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: { pm: { select: { id: true, displayName: true } } },
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

  async options() {
    return this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, projectCode: true, name: true },
      orderBy: [{ publishedOn: 'desc' }, { projectCode: 'desc' }],
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        pm: { select: { id: true, displayName: true } },
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
      this.summary(id),
      attachmentMap(this.prisma, 'PROJECT', [id]),
    ]);
    return { ...project, financialSummary, attachments: attachments[id] ?? [] };
  }

  async create(dto: CreateProjectDto, actorUserId: string) {
    const { periodValue, periodUnit, pmUserId, ...projectData } = dto;
    const pm = await this.findActivePm(pmUserId);
    const periodMonths = toPeriodMonths(periodValue, periodUnit);
    const year = new Date(dto.publishedOn).getUTCFullYear();
    const project = await this.prisma.$transaction(async (transaction) => {
      const counter = await transaction.projectCodeCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      const projectCode = formatProjectCode(year, counter.nextNumber - 1);
      return transaction.project.create({
        data: {
          ...projectData,
          pmName: pm.displayName,
          periodMonths,
          pmUserId,
          projectCode,
          publishedOn: new Date(dto.publishedOn),
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

  async update(id: string, dto: UpdateProjectDto, actorUserId: string) {
    const { periodValue, periodUnit, pmUserId, ...projectData } = dto;
    const before = await this.prisma.project.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('项目不存在');
    if ((periodValue === undefined) !== (periodUnit === undefined)) throw new BadRequestException('项目周期数值和单位必须同时填写');
    const periodMonths = periodValue && periodUnit ? toPeriodMonths(periodValue, periodUnit) : undefined;
    const pm = pmUserId ? await this.findActivePm(pmUserId) : undefined;
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

  async timeline(id: string) {
    const project = await this.findOne(id);
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
        id: item.id, date: item.issuedOn, type: 'INVOICE', label: item.kind === 'RED' ? '红字发票' : '开具发票', amount: item.totalAmount,
      })),
    ];
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async summary(projectId: string) {
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
        select: { projectId: true, kind: true, totalAmount: true },
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
      numeric[item.projectId]!.invoiced = (numeric[item.projectId]!.invoiced ?? 0)
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
