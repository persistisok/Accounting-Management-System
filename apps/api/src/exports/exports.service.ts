import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceDirection, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import { buildProjectWhere } from '../projects/projects.service';
import { ExportDataset, ExportQueryDto } from './exports.dto';

const MAX_EXPORT_ROWS = 20_000;
type ExportCell = string | number | boolean | Date | null;
type ExportRow = Record<string, ExportCell>;
interface ExportColumn { key: string; header: string; width?: number; numFmt?: string }

const moneyFormat = '#,##0.00';
const dateFormat = 'yyyy/mm/dd';
const statusLabels: Record<string, string> = {
  ACTIVE: '进行中', CLOSED: '已结项', ABORTED: '已中止',
  UNARCHIVED: '未归档', ARCHIVED: '已归档',
  SIGNED: '有效', VOID: '已作废', TERMINATED: '已终止',
  NORMAL: '正常', ISSUED: '已开票', RECEIVED: '已收票',
  SUPPORT_RECEIPT_ISSUED: '支持款收入票据', MEMBER_DUE_ISSUED: '会费收入票据',
  EXECUTION_PAYMENT_RECEIVED: '执行款支出票据', EXPERT_FEE_RECEIVED: '专家费支出票据',
  IN: '收入', OUT: '支出', MATCHED: '已匹配', UNMATCHED: '未匹配', EXCLUDED: '已作废',
  SUPPORT_RECEIPT: '支持款收入', MEMBER_DUE: '会费收入', EXECUTION_PAYMENT: '执行款支出', EXPERT_FEE: '专家费支出',
  COLLECTED: '已归集', NOT_APPLICABLE: '无需归集',
  SUPPORT: '支持协议', EXECUTION: '执行协议',
  PENDING: '待复核', APPROVED: '已通过', REJECTED: '已驳回', INACTIVE: '已停用',
  UNPAID: '未缴', PARTIAL: '部分缴纳', PAID: '已缴', WAIVED: '已免除',
  MANUAL: '手工录入', EXCEL: '模板导入', BLUE: '蓝票', RED: '红票',
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitive: SensitiveDataService,
    private readonly audit: AuditService,
  ) {}

  async export(dataset: ExportDataset, query: ExportQueryDto, user: AuthUser) {
    const workbook = this.createWorkbook(dataset);
    const result: { title: string; rowCount: number; sensitiveFields?: string[] } = dataset === ExportDataset.PROJECTS ? await this.projects(workbook, query)
      : dataset === ExportDataset.CONTRACTS ? await this.contracts(workbook, query)
        : dataset === ExportDataset.BANKING ? await this.banking(workbook, query)
          : dataset === ExportDataset.INVOICES ? await this.invoices(workbook, query)
            : dataset === ExportDataset.DONATION_RECEIPTS ? await this.donationReceipts(workbook, query)
            : dataset === ExportDataset.SUPPORTERS ? await this.organizations(workbook, query, 'SUPPORTER')
              : dataset === ExportDataset.EXECUTORS ? await this.organizations(workbook, query, 'EXECUTOR')
                : dataset === ExportDataset.EXPERTS ? await this.experts(workbook, query)
                  : await this.members(workbook, query);
    const output = await workbook.xlsx.writeBuffer();
    const filters = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''));
    await this.audit.record({
      actorUserId: user.id,
      action: result.sensitiveFields?.length ? 'EXPORT_SENSITIVE' : 'EXPORT',
      objectType: `EXPORT_${dataset.toUpperCase()}`,
      objectId: user.id,
      afterData: {
        filters,
        rowCount: result.rowCount,
        ...(result.sensitiveFields?.length ? { sensitiveFields: result.sensitiveFields } : {}),
      },
    });
    return {
      buffer: Buffer.from(output),
      fileName: `${result.title}_${this.timestamp()}.xlsx`,
    };
  }

  private async projects(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    const where = buildProjectWhere({
      page: 1,
      pageSize: 100,
      q: query.q,
      platform: query.platform,
      nature: query.nature,
      projectType: query.projectType,
      pmUserId: query.pmUserId,
      publishedFrom: query.publishedFrom,
      publishedTo: query.publishedTo,
      status: query.projectStatus,
    });
    await this.assertExportSize(this.prisma.project.count({ where }));
    const projects = await this.prisma.project.findMany({
      where,
      include: {
        pm: { select: { displayName: true } },
        statusReviewer: { select: { displayName: true } },
        archiveReviewer: { select: { displayName: true } },
        contracts: { where: { status: 'SIGNED' }, select: { contractType: true, amount: true } },
        allocations: { where: { status: 'CONFIRMED' }, select: { category: true, allocatedAmount: true } },
        invoices: { where: { status: 'NORMAL' }, select: { direction: true, kind: true, totalAmount: true } },
      },
      orderBy: [{ status: 'asc' }, { publishedOn: 'desc' }],
    });
    const attachments = await this.attachmentNames('PROJECT', projects.map((item) => item.id));
    const rows = projects.map((project): ExportRow => {
      const supportAgreement = sum(project.contracts.filter((item) => item.contractType === 'SUPPORT').map((item) => item.amount));
      const executionAgreement = sum(project.contracts.filter((item) => item.contractType === 'EXECUTION').map((item) => item.amount));
      const received = sum(project.allocations.filter((item) => item.category === 'SUPPORT_RECEIPT').map((item) => item.allocatedAmount));
      const paidExecution = sum(project.allocations.filter((item) => item.category === 'EXECUTION_PAYMENT').map((item) => item.allocatedAmount));
      const paidExpert = sum(project.allocations.filter((item) => item.category === 'EXPERT_FEE').map((item) => item.allocatedAmount));
      const invoiceAmount = (direction: InvoiceDirection) => project.invoices
        .filter((item) => item.direction === direction)
        .reduce((total, item) => total + Number(item.totalAmount) * (item.kind === 'RED' ? -1 : 1), 0);
      return {
        projectCode: project.projectCode, name: project.name, platform: project.platform, platformAbbreviation: project.platformAbbreviation ?? '', publishedOn: project.publishedOn,
        nature: project.nature, projectType: project.projectType, periodMonths: project.periodMonths,
        pm: project.pm?.displayName ?? project.pmName, approvedAmount: Number(project.approvedAmount), executionCost: Number(project.executionCost),
        supportAgreement, received, invoiced: invoiceAmount('ISSUED'), receivedInvoice: invoiceAmount('RECEIVED'),
        executionAgreement, paidExecution, paidExpert, status: label(project.status), archiveStatus: label(project.archiveStatus),
        statusReviewer: project.statusReviewer?.displayName ?? '', archiveReviewer: project.archiveReviewer?.displayName ?? '',
        remark: project.remark ?? '', attachments: attachments[project.id] ?? '',
      };
    });
    this.addSheet(workbook, '项目台账', [
      textColumn('projectCode', '项目编码', 20), textColumn('name', '项目名称', 28), textColumn('platform', '平台', 18), textColumn('platformAbbreviation', '平台缩写', 12), dateColumn('publishedOn', '立项时间'),
      textColumn('nature', '项目性质', 16), textColumn('projectType', '项目类型', 16), numberColumn('periodMonths', '项目周期（月）', 14), textColumn('pm', 'PM', 14),
      moneyColumn('approvedAmount', '立项金额'), moneyColumn('executionCost', '执行成本'), moneyColumn('supportAgreement', '支持协议金额'), moneyColumn('received', '实收金额'),
      moneyColumn('invoiced', '已开票金额'), moneyColumn('receivedInvoice', '已收票金额'), moneyColumn('executionAgreement', '执行协议金额'),
      moneyColumn('paidExecution', '已付执行款'), moneyColumn('paidExpert', '已付专家费'), textColumn('status', '项目状态', 12),
      textColumn('archiveStatus', '归档状态', 12), textColumn('statusReviewer', '状态复核人', 14), textColumn('archiveReviewer', '归档复核人', 14),
      textColumn('remark', '备注', 30), textColumn('attachments', '附件列表', 40),
    ], rows);
    return { title: '项目台账', rowCount: rows.length };
  }

  private async contracts(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    const where: Prisma.ContractWhereInput = query.q ? { OR: [
      { project: { name: { contains: query.q, mode: 'insensitive' } } },
      { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
      { contractEntity: { contains: query.q, mode: 'insensitive' } },
      { counterparty: { name: { contains: query.q, mode: 'insensitive' } } },
    ] } : {};
    await this.assertExportSize(this.prisma.contract.count({ where }));
    const items = await this.prisma.contract.findMany({ where, include: { project: true, counterparty: true }, orderBy: { signedOn: 'desc' } });
    const attachments = await this.attachmentNames('CONTRACT', items.map((item) => item.id));
    const rows = items.map((item): ExportRow => ({
      contractNo: item.contractNo, projectCode: item.project.projectCode, projectName: item.project.name,
      contractEntity: item.contractEntity, counterparty: item.counterparty.name, contractType: label(item.contractType),
      amount: Number(item.amount), signedOn: item.signedOn, status: label(item.status), attachments: attachments[item.id] ?? '',
    }));
    this.addSheet(workbook, '合同台账', [
      textColumn('contractNo', '合同编号', 22), textColumn('projectCode', '关联项目编码', 18), textColumn('projectName', '关联项目', 28),
      textColumn('contractEntity', '合同主体', 24), textColumn('counterparty', '支持方/执行方', 26), textColumn('contractType', '合同类型', 14),
      moneyColumn('amount', '合同金额'), dateColumn('signedOn', '签约日期'), textColumn('status', '状态', 12), textColumn('attachments', '附件列表', 40),
    ], rows);
    return { title: '合同台账', rowCount: rows.length };
  }

  private async banking(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    if (query.transactionFrom && query.transactionTo && query.transactionFrom > query.transactionTo) throw new BadRequestException('交易日期结束时间不能早于起始时间');
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.transactionStatus ? { settlementApplicable: query.transactionStatus === 'ACTIVE' } : {}),
      ...((query.transactionFrom || query.transactionTo) ? { transactionAt: {
        ...(query.transactionFrom ? { gte: new Date(query.transactionFrom) } : {}),
        ...(query.transactionTo ? { lte: new Date(query.transactionTo) } : {}),
      } } : {}),
      ...((query.bankCategory || query.bankProjectId || query.bankExpertProfileId || query.bankMembershipId) ? { allocations: { some: {
        ...(query.bankCategory ? { category: query.bankCategory } : {}),
        ...(query.bankProjectId ? { projectId: query.bankProjectId } : {}),
        ...(query.bankExpertProfileId ? { expertProfileId: query.bankExpertProfileId } : {}),
        ...(query.bankMembershipId ? { memberDue: { membershipId: query.bankMembershipId } } : {}),
      } } } : {}),
      ...(query.q ? { OR: [
        { transactionNo: { contains: query.q, mode: 'insensitive' } }, { counterpartyName: { contains: query.q, mode: 'insensitive' } },
        { counterpartyBankName: { contains: query.q, mode: 'insensitive' } }, { nature: { contains: query.q, mode: 'insensitive' } },
        { counterpartyAccountMasked: { contains: query.q, mode: 'insensitive' } },
        { allocations: { some: { project: { projectCode: { contains: query.q, mode: 'insensitive' } } } } },
      ] } : {}),
    };
    await this.assertExportSize(this.prisma.bankTransaction.count({ where }));
    const items = await this.prisma.bankTransaction.findMany({
      where,
      include: {
        bankAccount: true,
        allocations: { where: { status: 'CONFIRMED' }, include: {
          project: { select: { projectCode: true, name: true } },
          expertProfile: { select: { person: { select: { name: true } } } },
          memberDue: { include: { membership: { include: { committee: true } } } },
        } },
      },
      orderBy: { transactionAt: 'desc' },
    });
    const attachments = await this.attachmentNames('BANK_TRANSACTION', items.map((item) => item.id));
    const rows = items.map((item): ExportRow => {
      const allocation = item.allocations[0];
      const subject = allocation?.expertProfile?.person.name
        ?? allocation?.memberDue?.membership.memberName
        ?? allocation?.project?.name
        ?? '';
      return {
        transactionAt: item.transactionAt, transactionNo: item.transactionNo ?? '', ownBankName: item.bankAccount.bankName,
        ownAccount: this.decrypt(item.bankAccount.accountNumberEncrypted), direction: label(item.direction), category: label(allocation?.category),
        projectCode: allocation?.project?.projectCode ?? '', projectName: allocation?.project?.name ?? '', subject,
        counterpartyName: item.counterpartyName, counterpartyBankName: item.counterpartyBankName ?? '',
        counterpartyAccount: this.decrypt(item.counterpartyAccountEncrypted), amount: Number(item.amount), nature: item.nature,
        matchStatus: label(item.matchStatus), applicable: item.settlementApplicable ? '有效' : '已作废', sourceType: label(item.sourceType),
        attachments: attachments[item.id] ?? '',
      };
    });
    this.addSheet(workbook, '银行日记账', [
      dateColumn('transactionAt', '交易日期'), textColumn('transactionNo', '流水编号', 20), textColumn('ownBankName', '本方银行', 24),
      textColumn('ownAccount', '本方银行账号', 24), textColumn('direction', '收支方向', 12), textColumn('category', '资金分类', 16),
      textColumn('projectCode', '关联项目编码', 18), textColumn('projectName', '关联项目', 26), textColumn('subject', '关联专家/会员', 18),
      textColumn('counterpartyName', '对方账户名称', 22), textColumn('counterpartyBankName', '对方银行', 24), textColumn('counterpartyAccount', '对方银行账号', 24),
      moneyColumn('amount', '金额'), textColumn('nature', '性质', 20), textColumn('matchStatus', '匹配状态', 12), textColumn('applicable', '流水状态', 12),
      textColumn('sourceType', '录入来源', 12), textColumn('attachments', '附件列表', 40),
    ], rows);
    return { title: '银行日记账', rowCount: rows.length, sensitiveFields: ['ownAccount', 'counterpartyAccount'] };
  }

  private async invoices(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    if (query.issuedFrom && query.issuedTo && query.issuedFrom > query.issuedTo) throw new BadRequestException('发票日期结束时间不能早于起始时间');
    const where: Prisma.InvoiceWhereInput = {
      ...(query.invoiceCategory ? { category: query.invoiceCategory } : {}),
      ...(query.invoiceStatus ? { status: query.invoiceStatus } : {}),
      ...(query.invoiceCollectionStatus ? { collectionStatus: query.invoiceCollectionStatus } : {}),
      ...(query.invoiceProjectId ? { projectId: query.invoiceProjectId } : {}),
      ...(query.invoiceMembershipId ? { membershipId: query.invoiceMembershipId } : {}),
      ...(query.invoiceCommitteeId ? { membership: { committeeId: query.invoiceCommitteeId } } : {}),
      ...((query.issuedFrom || query.issuedTo) ? { issuedOn: {
        ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
        ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { invoiceType: { contains: query.q, mode: 'insensitive' } }, { invoicePlatform: { contains: query.q, mode: 'insensitive' } },
        { payerName: { contains: query.q, mode: 'insensitive' } },
        { buyerName: { contains: query.q, mode: 'insensitive' } }, { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
        { project: { name: { contains: query.q, mode: 'insensitive' } } },
        { membership: { memberName: { contains: query.q, mode: 'insensitive' } } },
        { expertProfile: { person: { name: { contains: query.q, mode: 'insensitive' } } } },
      ] } : {}),
    };
    await this.assertExportSize(this.prisma.invoice.count({ where }));
    const items = await this.prisma.invoice.findMany({ where, include: { project: true, membership: { include: { committee: true } }, expertProfile: { include: { person: true } } }, orderBy: { issuedOn: 'desc' } });
    const attachments = await this.attachmentNames('INVOICE', items.map((item) => item.id));
    const rows = items.map((item): ExportRow => ({
      category: label(item.category), projectCode: item.project?.projectCode ?? '', projectName: item.project?.name ?? '',
      payerName: item.payerName ?? '', memberName: item.membership?.memberName ?? '', committeeName: item.membership?.committee?.name ?? '', expertName: item.expertProfile?.person.name ?? '', issuedOn: item.issuedOn,
      invoiceType: item.invoiceType, invoicePlatform: item.invoicePlatform, buyerName: item.buyerName,
      amountExcludingTax: Number(item.amountExcludingTax), taxRate: Number(item.taxRate), taxAmount: Number(item.taxAmount),
      totalAmount: Number(item.totalAmount), collectionStatus: item.collectionStatus === 'PENDING' ? '待归集' : label(item.collectionStatus), kind: label(item.kind), status: label(item.status), attachments: attachments[item.id] ?? '',
    }));
    this.addSheet(workbook, '发票台账', [
      textColumn('category', '发票分类', 20), textColumn('projectCode', '关联项目编码', 18), textColumn('projectName', '关联项目', 28),
      textColumn('payerName', '交款人姓名', 20), textColumn('memberName', '关联会员', 20), textColumn('committeeName', '所属专委会', 24), textColumn('collectionStatus', '归集状态', 12), textColumn('expertName', '关联专家', 18),
      dateColumn('issuedOn', '开票日期'), textColumn('invoiceType', '开票类型', 16), textColumn('invoicePlatform', '开票平台', 18),
      textColumn('buyerName', '购买方/销售方名称', 28), moneyColumn('amountExcludingTax', '金额'), percentColumn('taxRate', '税率'),
      moneyColumn('taxAmount', '税额'), moneyColumn('totalAmount', '价税合计'), textColumn('kind', '票种', 10), textColumn('status', '状态', 10),
      textColumn('attachments', '附件列表', 40),
    ], rows);
    return { title: '发票台账', rowCount: rows.length };
  }

  private async organizations(workbook: ExcelJS.Workbook, query: ExportQueryDto, roleType: 'SUPPORTER' | 'EXECUTOR') {
    const where: Prisma.OrganizationWhereInput = {
      roles: { some: { roleType } },
      ...(query.q ? { OR: [
        { name: { contains: query.q, mode: 'insensitive' } }, { organizationCode: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    await this.assertExportSize(this.prisma.organization.count({ where }));
    const items = await this.prisma.organization.findMany({
      where,
      include: {
        owner: true,
        roles: true,
        contracts: { where: { status: 'SIGNED' }, select: { amount: true, contractType: true } },
        serviceCapabilities: { include: { capability: true }, orderBy: { capability: { sortOrder: 'asc' } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const [licenses, commitments, legalRepIds] = roleType === 'EXECUTOR' ? await Promise.all([
      this.attachmentNames('EXECUTOR_BUSINESS_LICENSE', items.map((item) => item.id)),
      this.attachmentNames('EXECUTOR_COMMITMENT', items.map((item) => item.id)),
      this.attachmentNames('EXECUTOR_LEGAL_REP_ID', items.map((item) => item.id)),
    ]) : [{}, {}, {}];
    const rows = items.map((item): ExportRow => ({
      organizationCode: item.organizationCode, name: item.name, platform: item.platform,
      joinedOn: item.roles.find((role) => role.roleType === roleType)?.joinedOn ?? null,
      owner: item.owner.displayName, contactName: item.contactName ?? '', contactPhone: item.contactPhone ?? '',
      cumulativeAmount: sum(item.contracts.filter((contract) => roleType === 'SUPPORTER' ? contract.contractType === 'SUPPORT' : contract.contractType === 'EXECUTION').map((contract) => contract.amount)),
      capabilities: item.serviceCapabilities.map((selection) => selection.capability.isOther && item.executorOtherCapabilityNote ? `其他：${item.executorOtherCapabilityNote}` : selection.capability.name).join('、'),
      businessLicense: licenses[item.id] ?? '', commitment: commitments[item.id] ?? '', legalRepId: legalRepIds[item.id] ?? '',
      reviewStatus: label(item.roles.find((role) => role.roleType === roleType)?.reviewStatus), status: item.status === 'ACTIVE' ? '启用' : '停用',
    }));
    const title = roleType === 'SUPPORTER' ? '支持方库' : '执行方库';
    const columns = roleType === 'SUPPORTER' ? [
      textColumn('organizationCode', '机构编号', 18), textColumn('name', '机构名称', 30), textColumn('platform', '入库平台', 20),
      dateColumn('joinedOn', '入库时间'), textColumn('owner', '负责PM', 14), textColumn('contactName', '联系人', 16),
      textColumn('contactPhone', '联系电话', 18), moneyColumn('cumulativeAmount', '累计协议金额'), textColumn('reviewStatus', '复核状态', 12), textColumn('status', '状态', 10),
    ] : [
      textColumn('organizationCode', '执行方编号', 18), textColumn('name', '供应商名称', 30), dateColumn('joinedOn', '入库时间'),
      textColumn('owner', '介绍人', 14), textColumn('contactName', '联系人', 16), textColumn('contactPhone', '联系电话', 18),
      textColumn('capabilities', '服务能力', 38), textColumn('businessLicense', '营业执照', 32), textColumn('commitment', '承诺书', 32),
      textColumn('legalRepId', '法人身份证复印件', 32), moneyColumn('cumulativeAmount', '累计合作金额'), textColumn('status', '状态', 10),
    ];
    this.addSheet(workbook, title, columns, rows);
    return { title, rowCount: rows.length };
  }

  private async donationReceipts(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    if (query.donationIssuedFrom && query.donationIssuedTo && query.donationIssuedFrom > query.donationIssuedTo) {
      throw new BadRequestException('捐赠票据日期结束时间不能早于起始时间');
    }
    const where: Prisma.DonationReceiptWhereInput = {
      ...(query.donationProjectId ? { projectId: query.donationProjectId } : {}),
      ...(query.donationDonorId ? { donorId: query.donationDonorId } : {}),
      ...(query.donationStatus ? { status: query.donationStatus } : {}),
      ...((query.donationIssuedFrom || query.donationIssuedTo) ? { issuedOn: {
        ...(query.donationIssuedFrom ? { gte: new Date(query.donationIssuedFrom) } : {}),
        ...(query.donationIssuedTo ? { lte: new Date(query.donationIssuedTo) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { receiptNumber: { contains: query.q, mode: 'insensitive' } },
        { project: { OR: [{ projectCode: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] } },
        { donor: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    await this.assertExportSize(this.prisma.donationReceipt.count({ where }));
    const items = await this.prisma.donationReceipt.findMany({ where, include: { project: true, donor: true }, orderBy: { issuedOn: 'desc' } });
    const attachments = await this.attachmentNames('DONATION_RECEIPT', items.map((item) => item.id));
    const rows = items.map((item): ExportRow => ({
      receiptNumber: item.receiptNumber, projectCode: item.project.projectCode, projectName: item.project.name,
      donorName: item.donor.name, issuedOn: item.issuedOn, amount: Number(item.amount),
      status: item.status === 'NORMAL' ? '正常' : '已作废', remark: item.remark ?? '', attachments: attachments[item.id] ?? '',
    }));
    this.addSheet(workbook, '捐赠票据台账', [
      textColumn('receiptNumber', '票据编号', 22), textColumn('projectCode', '项目编码', 20), textColumn('projectName', '项目名称', 28),
      textColumn('donorName', '捐赠方', 28), dateColumn('issuedOn', '开具日期'), moneyColumn('amount', '票据金额'),
      textColumn('status', '状态', 12), textColumn('remark', '备注', 32), textColumn('attachments', '附件列表', 40),
    ], rows);
    return { title: '捐赠票据台账', rowCount: rows.length };
  }

  private async experts(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    if (query.paymentFrom && query.paymentTo && query.paymentFrom > query.paymentTo) {
      throw new BadRequestException('专家费统计结束日期不能早于起始日期');
    }
    const where: Prisma.ExpertProfileWhereInput = {
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.recordStatus ? { status: query.recordStatus } : {}),
      ...(query.pmUserId ? { formOwnerId: query.pmUserId } : {}),
      ...(query.q ? { person: { name: { contains: query.q, mode: 'insensitive' } } } : {}),
    };
    await this.assertExportSize(this.prisma.expertProfile.count({ where }));
    const items = await this.prisma.expertProfile.findMany({
      where,
      include: {
        person: true, formOwner: true, reviewer: true,
        allocations: {
          where: {
            category: 'EXPERT_FEE', status: 'CONFIRMED',
            ...(query.paymentFrom || query.paymentTo ? { bankTransaction: { transactionAt: {
              ...(query.paymentFrom ? { gte: new Date(query.paymentFrom) } : {}),
              ...(query.paymentTo ? { lte: new Date(query.paymentTo) } : {}),
            } } } : {}),
          },
          select: { allocatedAmount: true, bankTransaction: { select: { transactionAt: true } } },
        },
      },
      orderBy: { joinedOn: 'desc' },
    });
    const credentials = await this.attachmentNames('EXPERT_CREDENTIAL', items.map((item) => item.id));
    const rows = items.map((item): ExportRow => ({
      name: item.person.name, organizationName: item.person.organizationName ?? '', professionalTitle: item.professionalTitle ?? '',
      phone: this.decrypt(item.person.phoneEncrypted), idNumber: this.decrypt(item.person.idNumberEncrypted), bankName: item.bankName ?? '',
      bankAccount: this.decrypt(item.bankAccountEncrypted), credentials: credentials[item.id] ?? '', joinedOn: item.joinedOn,
      email: item.person.email ?? '', department: item.person.department ?? '', position: item.person.position ?? '',
      formOwner: item.formOwner.displayName, reviewer: item.reviewer?.displayName ?? '',
      paymentCount: item.allocations.length,
      paymentAmount: sum(item.allocations.map((allocation) => allocation.allocatedAmount)),
      status: item.status === 'INACTIVE' ? '已停用' : item.reviewStatus === 'APPROVED' ? '已通过' : '待复核',
    }));
    this.addSheet(workbook, '专家库', [
      textColumn('name', '姓名', 14), textColumn('organizationName', '单位', 26), textColumn('professionalTitle', '职称', 16),
      textColumn('phone', '手机号', 18), textColumn('idNumber', '身份证号码', 22), textColumn('bankName', '开户行', 24),
      textColumn('bankAccount', '银行账号', 24), textColumn('credentials', '职称证明/工作证/医师执业证', 40), dateColumn('joinedOn', '入库时间'),
      textColumn('email', '邮箱', 28), textColumn('department', '专业/科室', 18), textColumn('position', '职务', 16),
      textColumn('formOwner', '填表人-PM', 16), numberColumn('paymentCount', '累计支付次数', 14), moneyColumn('paymentAmount', '支付总额', 18),
      textColumn('reviewer', '复核人', 16), textColumn('status', '状态', 12),
    ], rows);
    return { title: '专家库_完整信息', rowCount: rows.length, sensitiveFields: ['phone', 'idNumber', 'bankAccount'] };
  }

  private async members(workbook: ExcelJS.Workbook, query: ExportQueryDto) {
    const where: Prisma.MembershipWhereInput = {
      ...(query.committeeId ? { committeeId: query.committeeId } : {}),
      ...(query.q ? { OR: [
        { memberName: { contains: query.q, mode: 'insensitive' } }, { organizationName: { contains: query.q, mode: 'insensitive' } },
        { department: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } },
        { committee: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    await this.assertExportSize(this.prisma.membership.count({ where }));
    const items = await this.prisma.membership.findMany({
      where,
      include: {
        committee: true, pm: true,
        dues: { include: { allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true, confirmedAt: true } } }, orderBy: [{ dueOn: 'desc' }, { createdAt: 'desc' }] },
        invoices: { where: { category: 'MEMBER_DUE_ISSUED', collectionStatus: 'COLLECTED', status: 'NORMAL' }, select: { totalAmount: true, kind: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const attachments = await this.attachmentNames('MEMBERSHIP', items.map((item) => item.id));
    const memberRows = items.map((item): ExportRow => {
      const dueAmount = sum(item.dues.filter((due) => due.status !== 'WAIVED').map((due) => due.amountDue));
      const paidAmount = item.dues.reduce((total, due) => total + sum(due.allocations.map((allocation) => allocation.allocatedAmount)), 0);
      const invoicedAmount = item.invoices.reduce((total, invoice) => total + Number(invoice.totalAmount) * (invoice.kind === 'RED' ? -1 : 1), 0);
      return {
        memberName: item.memberName, memberType: item.memberType, memberPosition: item.memberPosition ?? '',
        organizationName: item.organizationName ?? '', department: item.department ?? '', idNumber: this.decrypt(item.idNumberEncrypted), phone: this.decrypt(item.phoneEncrypted), email: item.email ?? '',
        committeeCode: item.committee?.committeeCode ?? '', committeeName: item.committee?.name ?? '', pm: item.pm.displayName,
        committeeMemberStatus: item.committee ? (item.committeeMemberStatus === 'LEFT_OFFICE' ? '离任' : '在任') : '未加入专委会',
        committeeTerm: item.committeeTerm ?? '', joinedOn: item.joinedOn,
        certificateIssued: item.certificateIssued ? '是' : '否', appointmentLetterIssued: item.appointmentLetterIssued ? '是' : '否', dueCount: item.dues.length,
        dueAmount, paidAmount, invoicedAmount, outstandingAmount: Math.max(0, dueAmount - paidAmount), status: item.status === 'ACTIVE' ? '启用' : '停用',
        attachments: attachments[item.id] ?? '',
      };
    });
    this.addSheet(workbook, '会员库', [
      textColumn('memberName', '会员名称', 20), textColumn('memberType', '会员类别', 16), textColumn('memberPosition', '会员职务', 16),
      textColumn('organizationName', '单位', 26), textColumn('department', '科室', 18), textColumn('idNumber', '身份证号', 22), textColumn('phone', '手机号', 16), textColumn('email', '邮箱', 24),
      textColumn('committeeCode', '专委会编码', 18), textColumn('committeeName', '所属专委会', 28), textColumn('pm', 'PM', 14),
      textColumn('committeeMemberStatus', '专委会任职状态', 16), numberColumn('committeeTerm', '届次', 10),
      dateColumn('joinedOn', '入会日期'), textColumn('certificateIssued', '是否发放会员证书', 18), textColumn('appointmentLetterIssued', '是否发放委员聘书', 18), numberColumn('dueCount', '会费笔数', 12),
      moneyColumn('dueAmount', '应收会费'), moneyColumn('paidAmount', '实收会费'), moneyColumn('invoicedAmount', '已开票会费'), moneyColumn('outstandingAmount', '未收会费'),
      textColumn('status', '状态', 10), textColumn('attachments', '附件列表', 40),
    ], memberRows);
    const dueRows = items.flatMap((item) => item.dues.map((due): ExportRow => {
      const paid = sum(due.allocations.map((allocation) => allocation.allocatedAmount));
      const lastPaidAt = due.allocations.map((allocation) => allocation.confirmedAt).filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return {
        memberName: item.memberName, committeeCode: item.committee?.committeeCode ?? '', committeeName: item.committee?.name ?? '',
        dueCode: due.dueCode, periodLabel: due.periodLabel ?? '', amountDue: Number(due.amountDue), amountPaid: paid,
        outstanding: due.status === 'WAIVED' ? 0 : Math.max(0, Number(due.amountDue) - paid), dueOn: due.dueOn, lastPaidAt, status: label(due.status),
      };
    }));
    this.addSheet(workbook, '会费明细', [
      textColumn('memberName', '会员名称', 20), textColumn('committeeCode', '专委会编码', 18), textColumn('committeeName', '所属专委会', 28),
      textColumn('dueCode', '会费编号', 18), textColumn('periodLabel', '会费期间', 16), moneyColumn('amountDue', '应收金额'),
      moneyColumn('amountPaid', '实收金额'), moneyColumn('outstanding', '未收金额'), dateColumn('dueOn', '应缴日期'),
      dateColumn('lastPaidAt', '最近收款日期'), textColumn('status', '状态', 12),
    ], dueRows);
    return { title: '会员库', rowCount: memberRows.length, sensitiveFields: ['idNumber', 'phone'] };
  }

  private createWorkbook(dataset: ExportDataset) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PMS 项目管理系统';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = `筛选导出：${dataset}`;
    return workbook;
  }

  private addSheet(workbook: ExcelJS.Workbook, title: string, columns: ExportColumn[], rows: ExportRow[]) {
    const sheet = workbook.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({
      key: column.key, header: column.header, width: column.width ?? 16,
      style: column.numFmt ? { numFmt: column.numFmt } : undefined,
    }));
    sheet.addRows(rows);
    const header = sheet.getRow(1);
    header.height = 26;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E63' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    sheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: 'middle', wrapText: true };
      if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7F6' } };
    });
  }

  private async attachmentNames(objectType: string, objectIds: string[]) {
    if (!objectIds.length) return {} as Record<string, string>;
    const items = await this.prisma.attachment.findMany({
      where: { objectType, objectId: { in: objectIds } }, select: { objectId: true, fileName: true }, orderBy: { createdAt: 'asc' },
    });
    const result: Record<string, string[]> = {};
    for (const item of items) (result[item.objectId] ??= []).push(item.fileName);
    return Object.fromEntries(Object.entries(result).map(([id, names]) => [id, names.join('；')]));
  }

  private decrypt(value?: string | null) {
    if (!value) return '';
    try { return this.sensitive.decrypt(value) ?? ''; } catch { return '历史数据无法解密'; }
  }

  private async assertExportSize(countPromise: Promise<number>) {
    const count = await countPromise;
    if (count > MAX_EXPORT_ROWS) throw new BadRequestException(`筛选结果共 ${count} 条，单次最多导出 ${MAX_EXPORT_ROWS} 条，请缩小筛选范围`);
  }

  private timestamp() {
    const date = new Date();
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}${value.month}${value.day}_${value.hour}${value.minute}`;
  }
}

function label(value?: string | null) {
  return value ? statusLabels[value] ?? value : '';
}

function sum(values: Array<{ toString(): string } | number>) {
  return values.reduce<number>((total, value) => total + Number(value), 0);
}

function textColumn(key: string, header: string, width?: number): ExportColumn { return { key, header, width }; }
function numberColumn(key: string, header: string, width = 14): ExportColumn { return { key, header, width, numFmt: '0' }; }
function moneyColumn(key: string, header: string, width = 16): ExportColumn { return { key, header, width, numFmt: moneyFormat }; }
function dateColumn(key: string, header: string, width = 14): ExportColumn { return { key, header, width, numFmt: dateFormat }; }
function percentColumn(key: string, header: string, width = 12): ExportColumn { return { key, header, width, numFmt: '0.00%' }; }
