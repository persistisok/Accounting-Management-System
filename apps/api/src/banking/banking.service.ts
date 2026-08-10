import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AllocationCategory, MatchStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { normalizeImportDate, parseCsv } from '../common/csv-import';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { BankAccountListQueryDto, CreateBankAccountDto, CreateTransactionDto, TransactionListQueryDto, UpdateBankAccountDto, UpdateTransactionDto } from './banking.dto';

const incomeCategories: AllocationCategory[] = ['SUPPORT_RECEIPT', 'MEMBER_DUE'];
const expenseCategories: AllocationCategory[] = ['EXECUTION_PAYMENT', 'EXPERT_FEE'];
const supportedCategories: AllocationCategory[] = [...incomeCategories, ...expenseCategories];
const importHeaders = ['本方银行账号', '收支方向', '资金分类', '关联项目编码', '专家姓名', '专家身份证号', '专委会编码', '会员姓名', '交易日期', '对方账户名称', '对方银行名称', '对方银行账号', '金额', '性质'] as const;
const expertReportHeaders = ['姓名', '身份证号', '支付金额', '是否入库', '职称', '身份证号', '手机号', '开户行', '银行卡号', '个税'] as const;
const importCategoryMap: Record<string, AllocationCategory> = {
  支持款收入: 'SUPPORT_RECEIPT', 会员会费收入: 'MEMBER_DUE', 执行款支出: 'EXECUTION_PAYMENT', 专家费支出: 'EXPERT_FEE',
};

export interface BankingImportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface BankingImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
  expertReport?: {
    fileName: string;
    contentBase64: string;
    rowCount: number;
  };
}

interface ExpertImportMatch {
  expertId?: string;
  eligibleError?: string;
  name: string;
  inputIdNumber: string;
  amount: string;
  inLibrary: boolean;
  professionalTitle: string;
  matchedIdNumber: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  individualIncomeTax: string;
}
const publicAccountSelect = {
  id: true,
  bankName: true,
  accountNumberMasked: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { transactions: true } },
} satisfies Prisma.BankAccountSelect;

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sensitive: SensitiveDataService,
  ) {}

  async accounts(query: BankAccountListQueryDto) {
    const where: Prisma.BankAccountWhereInput = query.q ? { OR: [
      { bankName: { contains: query.q, mode: 'insensitive' } },
      { accountNumberMasked: { contains: query.q, mode: 'insensitive' } },
    ] } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankAccount.findMany({
        where,
        select: publicAccountSelect,
        orderBy: [{ status: 'asc' }, { bankName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.bankAccount.count({ where }),
    ]);
    return { items, total };
  }

  accountOptions() {
    return this.prisma.bankAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, bankName: true, accountNumberMasked: true },
      orderBy: { bankName: 'asc' },
    });
  }

  async createAccount(dto: CreateBankAccountDto, actorUserId: string) {
    const bankName = dto.bankName.trim();
    const accountNumber = this.normalizeAccountNumber(dto.accountNumber);
    if (!bankName || !accountNumber) throw new BadRequestException('银行名称和银行账号不能为空');
    await this.ensureAccountNumberAvailable(accountNumber);
    const account = await this.prisma.bankAccount.create({
      data: {
        accountName: bankName,
        bankName,
        accountNumberEncrypted: this.sensitive.encrypt(accountNumber)!,
        accountNumberHash: this.sensitive.hash(accountNumber),
        accountNumberMasked: this.sensitive.maskBank(accountNumber)!,
      },
      select: publicAccountSelect,
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'BANK_ACCOUNT', objectId: account.id,
      afterData: { bankName: account.bankName, accountNumberMasked: account.accountNumberMasked, status: account.status },
    });
    return account;
  }

  async updateAccount(id: string, dto: UpdateBankAccountDto, actorUserId: string) {
    const before = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('本方银行账户不存在');
    const bankName = dto.bankName?.trim();
    if (dto.bankName !== undefined && !bankName) throw new BadRequestException('银行名称不能为空');
    const accountNumber = dto.accountNumber !== undefined ? this.normalizeAccountNumber(dto.accountNumber) : undefined;
    if (dto.accountNumber !== undefined && !accountNumber) throw new BadRequestException('银行账号不能为空');
    if (accountNumber) await this.ensureAccountNumberAvailable(accountNumber, id);
    const account = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(bankName ? { bankName, accountName: bankName } : {}),
        ...(accountNumber ? {
          accountNumberEncrypted: this.sensitive.encrypt(accountNumber)!,
          accountNumberHash: this.sensitive.hash(accountNumber),
          accountNumberMasked: this.sensitive.maskBank(accountNumber)!,
        } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      select: publicAccountSelect,
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'BANK_ACCOUNT', objectId: id,
      beforeData: { bankName: before.bankName, accountNumberMasked: before.accountNumberMasked, status: before.status },
      afterData: { bankName: account.bankName, accountNumberMasked: account.accountNumberMasked, status: account.status },
    });
    return account;
  }

  async removeAccount(id: string, actorUserId: string) {
    const before = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('本方银行账户不存在');
    const account = await this.prisma.bankAccount.update({ where: { id }, data: { status: 'INACTIVE' }, select: publicAccountSelect });
    await this.audit.record({
      actorUserId, action: 'DELETE', objectType: 'BANK_ACCOUNT', objectId: id,
      beforeData: { status: before.status }, afterData: { status: account.status },
    });
    return account;
  }

  async list(query: TransactionListQueryDto, user?: AuthUser) {
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.matchStatus ? { matchStatus: query.matchStatus as MatchStatus } : {}),
      ...(user?.role === 'PM' ? { allocations: { some: { OR: [
        { project: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } },
        { expertProfile: { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } },
        { memberDue: { membership: { pmUserId: user.projectManagerId ?? '__unbound_pm__' } } },
      ] } } } : {}),
      ...(query.q ? { OR: [
        { transactionNo: { contains: query.q, mode: 'insensitive' } },
        { counterpartyName: { contains: query.q, mode: 'insensitive' } },
        { counterpartyBankName: { contains: query.q, mode: 'insensitive' } },
        { counterpartyAccountMasked: { contains: query.q, mode: 'insensitive' } },
        { nature: { contains: query.q, mode: 'insensitive' } },
        { allocations: { some: { project: { projectCode: { contains: query.q, mode: 'insensitive' } } } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { bankName: true, accountNumberMasked: true } },
          allocations: {
            include: {
              project: { select: { id: true, projectCode: true, name: true } },
              expertProfile: { include: { person: { select: { name: true } } } },
              memberDue: { include: { membership: { include: { committee: true } } } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { transactionAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'BANK_TRANSACTION', items.map((item) => item.id));
    return {
      items: items.map((item) => ({
        ...this.withoutCounterpartyAccount(item),
        attachments: attachments[item.id] ?? [],
      })),
      total,
    };
  }

  importTemplate() {
    return Buffer.from(`\uFEFF${importHeaders.join(',')}\r\n`, 'utf8');
  }

  async importTransactions(file: BankingImportFile, user: AuthUser): Promise<BankingImportResult> {
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
    const expertRows: ExpertImportMatch[] = [];
    let successCount = 0;
    for (let index = 0; index < dataRows.length; index += 1) {
      const rowNumber = index + 2;
      const raw = Object.fromEntries(headers.map((header, column) => [header, dataRows[index]![column]?.trim() ?? '']));
      try {
        const expertMatch = raw['资金分类'] === '专家费支出' ? await this.resolveImportExpert(raw, user) : undefined;
        if (expertMatch) expertRows.push(expertMatch);
        const dto = await this.resolveImportRow(raw, user, expertMatch);
        const rowHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
        await this.createTransaction(dto, user.id, user, { rowHash, rawData: this.sanitizeImportRawData(raw) });
        successCount += 1;
      } catch (error) {
        const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        errors.push({ row: rowNumber, message: duplicate ? '该流水已导入，请勿重复导入' : errorMessage(error) });
      }
    }
    const result: BankingImportResult = { total: dataRows.length, successCount, failureCount: errors.length, errors };
    if (expertRows.length) {
      const report = this.expertImportReport(expertRows);
      result.expertReport = {
        fileName: `专家费导入匹配及个税_${new Date().toISOString().slice(0, 10)}.csv`,
        contentBase64: report.toString('base64'),
        rowCount: expertRows.length,
      };
      await this.audit.record({
        actorUserId: user.id,
        action: 'EXPORT_SENSITIVE',
        objectType: 'BANK_EXPERT_REPORT',
        objectId: user.id,
        afterData: {
          rowCount: expertRows.length,
          matchedExpertIds: [...new Set(expertRows.flatMap((row) => row.expertId ? [row.expertId] : []))],
          fields: ['professionalTitle', 'idNumber', 'phone', 'bankName', 'bankAccount', 'individualIncomeTax'],
        },
      });
    }
    return result;
  }

  async createTransaction(
    dto: CreateTransactionDto,
    actorUserId: string,
    user?: AuthUser,
    importSource?: { rowHash: string; rawData: Record<string, string> },
  ) {
    if (Number(dto.amount) <= 0) throw new BadRequestException('流水金额必须大于零');
    await this.requireActiveBankAccount(dto.bankAccountId);
    this.validateCategory(dto.direction, dto.category);
    await this.validateAssociation(dto.category, dto.projectId, dto.expertProfileId, dto.membershipId, user);
    const accountNumber = this.normalizeAccountNumber(dto.counterpartyAccountNumber);
    const counterpartyBankName = dto.counterpartyBankName.trim();
    if (!counterpartyBankName || !accountNumber) throw new BadRequestException('对方银行名称和银行账号不能为空');
    const { counterpartyAccountNumber: _accountNumber, projectId, expertProfileId, membershipId, category, ...data } = dto;
    void _accountNumber;
    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankTransaction.create({
        data: {
          ...data,
          counterpartyBankName,
          counterpartyAccountEncrypted: this.sensitive.encrypt(accountNumber),
          counterpartyAccountMasked: this.sensitive.maskBank(accountNumber),
          transactionAt: new Date(dto.transactionAt),
          settlementApplicable: true,
          sourceType: importSource ? 'EXCEL' : 'MANUAL',
          sourceRowHash: importSource?.rowHash,
          rawData: importSource?.rawData,
          matchStatus: 'MATCHED',
        },
      });
      await this.createConfirmedAllocations(tx, {
        bankTransactionId: created.id, projectId, expertProfileId, membershipId, category,
        amount: Number(dto.amount), actorUserId,
      });
      return tx.bankTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { bankAccount: true, allocations: { include: { project: true, expertProfile: { include: { person: true } }, memberDue: { include: { membership: true } } } } },
      });
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'BANK_TRANSACTION', objectId: transaction.id,
      afterData: { direction: transaction.direction, amount: transaction.amount.toString(), counterpartyName: transaction.counterpartyName },
    });
    return this.withoutCounterpartyAccount(transaction);
  }

  private async resolveImportRow(raw: Record<string, string>, user: AuthUser, expertMatch?: ExpertImportMatch): Promise<CreateTransactionDto> {
    const value = (header: typeof importHeaders[number]) => raw[header]?.trim() ?? '';
    const accountNumber = this.normalizeAccountNumber(value('本方银行账号'));
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { accountNumberHash: this.sensitive.hash(accountNumber), status: 'ACTIVE' }, select: { id: true },
    });
    if (!bankAccount) throw new BadRequestException('本方银行账号不存在或已停用');
    const direction = value('收支方向') === '收入' ? 'IN' : value('收支方向') === '支出' ? 'OUT' : null;
    if (!direction) throw new BadRequestException('收支方向只能填写“收入”或“支出”');
    const category = importCategoryMap[value('资金分类')];
    if (!category) throw new BadRequestException('资金分类填写不正确');
    const projectCode = value('关联项目编码');
    const project = category === 'MEMBER_DUE' ? null : await this.prisma.project.findFirst({
      where: { projectCode, status: 'ACTIVE', ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}) }, select: { id: true },
    });
    if (category !== 'MEMBER_DUE' && !project) throw new BadRequestException('关联项目编码不存在、已结束或不属于当前 PM');

    let expertProfileId: string | undefined;
    if (category === 'EXPERT_FEE') {
      if (!expertMatch?.expertId) throw new BadRequestException(expertMatch?.eligibleError ?? '未按姓名和身份证号匹配到专家');
      if (expertMatch.eligibleError) throw new BadRequestException(expertMatch.eligibleError);
      expertProfileId = expertMatch.expertId;
    }

    let membershipId: string | undefined;
    if (category === 'MEMBER_DUE') {
      const memberships = await this.prisma.membership.findMany({
        where: {
          memberName: value('会员姓名'), status: 'ACTIVE', committee: { committeeCode: value('专委会编码'), status: 'ACTIVE' },
          ...(user.role === 'PM' ? { pmUserId: user.projectManagerId ?? '__unbound_pm__' } : {}),
        }, select: { id: true }, take: 2,
      });
      if (memberships.length !== 1) throw new BadRequestException(memberships.length ? '会员信息重复，无法唯一匹配' : '会员或专委会不存在，或不属于当前 PM');
      membershipId = memberships[0]!.id;
    }

    const amount = value('金额');
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new BadRequestException('金额必须为大于零且最多两位小数的数字');
    return {
      bankAccountId: bankAccount.id,
      projectId: project?.id,
      expertProfileId,
      membershipId,
      category,
      transactionAt: normalizeImportDate(value('交易日期'), '交易日期'),
      counterpartyName: category === 'EXPERT_FEE' ? expertMatch!.name : requiredImportValue(value('对方账户名称'), '对方账户名称'),
      counterpartyBankName: category === 'EXPERT_FEE' ? expertMatch!.bankName : requiredImportValue(value('对方银行名称'), '对方银行名称'),
      counterpartyAccountNumber: category === 'EXPERT_FEE' ? expertMatch!.bankAccount : requiredImportValue(value('对方银行账号'), '对方银行账号'),
      direction,
      amount,
      nature: requiredImportValue(value('性质'), '性质'),
    };
  }

  private async resolveImportExpert(raw: Record<string, string>, user: AuthUser): Promise<ExpertImportMatch> {
    const name = raw['专家姓名']?.trim() ?? '';
    const inputIdNumber = raw['专家身份证号']?.trim() ?? '';
    const amount = raw['金额']?.trim() ?? '';
    const base: ExpertImportMatch = {
      name,
      inputIdNumber,
      amount,
      inLibrary: false,
      professionalTitle: '',
      matchedIdNumber: '',
      phone: '',
      bankName: '',
      bankAccount: '',
      individualIncomeTax: /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0
        ? calculateExpertIndividualIncomeTax(Number(amount)).toFixed(2)
        : '',
    };
    if (!name) return { ...base, eligibleError: '专家姓名不能为空' };
    if (!inputIdNumber) return { ...base, eligibleError: '专家身份证号不能为空' };

    const expert = await this.prisma.expertProfile.findFirst({
      where: {
        person: { name, idNumberHash: this.sensitive.hash(inputIdNumber) },
        ...(user.role === 'PM' ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        professionalTitle: true,
        bankName: true,
        bankAccountEncrypted: true,
        person: { select: { idNumberEncrypted: true, phoneEncrypted: true } },
      },
    });
    if (!expert) return { ...base, eligibleError: '未按姓名和身份证号匹配到已入库专家，或专家不属于当前 PM' };

    const decrypt = (value?: string | null) => {
      try { return this.sensitive.decrypt(value) ?? ''; } catch { return ''; }
    };
    const matched: ExpertImportMatch = {
      ...base,
      expertId: expert.id,
      inLibrary: true,
      professionalTitle: expert.professionalTitle ?? '',
      matchedIdNumber: decrypt(expert.person.idNumberEncrypted),
      phone: decrypt(expert.person.phoneEncrypted),
      bankName: expert.bankName ?? '',
      bankAccount: decrypt(expert.bankAccountEncrypted),
    };
    if (expert.status !== 'ACTIVE' || expert.reviewStatus !== 'APPROVED') {
      matched.eligibleError = '专家已入库，但未通过复核或已停用';
    } else if (!matched.bankName || !matched.bankAccount) {
      matched.eligibleError = '专家已入库，但未完整登记开户行和银行卡号';
    }
    return matched;
  }

  private sanitizeImportRawData(raw: Record<string, string>) {
    return {
      ...raw,
      专家身份证号: this.sensitive.maskId(raw['专家身份证号']) ?? '',
      对方银行账号: this.sensitive.maskBank(raw['对方银行账号']) ?? '',
    };
  }

  private expertImportReport(rows: ExpertImportMatch[]) {
    const data = rows.map((row) => [
      row.name,
      row.inputIdNumber,
      row.amount,
      row.inLibrary ? '是' : '否',
      row.professionalTitle,
      row.matchedIdNumber,
      row.phone,
      row.bankName,
      row.bankAccount,
      row.individualIncomeTax,
    ]);
    return Buffer.from(`\uFEFF${[expertReportHeaders, ...data].map((values) => values.map(csvValue).join(',')).join('\r\n')}\r\n`, 'utf8');
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id },
      include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true, projectId: true, memberDueId: true, expertProfileId: true, category: true, allocatedAmount: true, memberDue: { select: { membershipId: true } } } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
    await this.assertTransactionScope(id, user);
    if (!before.settlementApplicable) throw new BadRequestException('已作废的流水不能编辑');
    if (dto.amount !== undefined && Number(dto.amount) <= 0) throw new BadRequestException('流水金额必须大于零');
    const nextAmount = dto.amount !== undefined ? Number(dto.amount) : Number(before.amount);
    const nextDirection = dto.direction ?? before.direction;
    const currentAllocation = before.allocations[0];
    const category = dto.category ?? currentAllocation?.category;
    if (!category) throw new BadRequestException('请选择资金分类');
    const projectId = category === 'MEMBER_DUE' ? undefined : dto.projectId ?? currentAllocation?.projectId ?? undefined;
    const expertProfileId = category === 'EXPERT_FEE' ? dto.expertProfileId ?? currentAllocation?.expertProfileId ?? undefined : undefined;
    const membershipId = category === 'MEMBER_DUE' ? dto.membershipId ?? currentAllocation?.memberDue?.membershipId ?? undefined : undefined;
    this.validateCategory(nextDirection, category);
    await this.validateAssociation(category, projectId, expertProfileId, membershipId, user);
    if (dto.bankAccountId) await this.requireActiveBankAccount(dto.bankAccountId);
    const accountNumber = dto.counterpartyAccountNumber !== undefined ? this.normalizeAccountNumber(dto.counterpartyAccountNumber) : undefined;
    if (dto.counterpartyAccountNumber !== undefined && !accountNumber) throw new BadRequestException('对方银行账号不能为空');
    if (dto.counterpartyBankName !== undefined && !dto.counterpartyBankName.trim()) throw new BadRequestException('对方银行名称不能为空');
    const { counterpartyAccountNumber: _accountNumber, transactionAt, projectId: _projectId, expertProfileId: _expertProfileId, membershipId: _membershipId, category: _category, ...data } = dto;
    void _accountNumber;
    void _projectId;
    void _expertProfileId;
    void _membershipId;
    void _category;
    const dueIds = [...new Set(before.allocations.flatMap((item) => item.memberDueId ? [item.memberDueId] : []))];
    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.bankAllocation.updateMany({
        where: { bankTransactionId: id, status: 'CONFIRMED' }, data: { status: 'REVERSED' },
      });
      for (const dueId of dueIds) await this.updateDueStatus(tx, dueId);
      await tx.bankTransaction.update({
        where: { id },
        data: {
          ...data,
          ...(dto.counterpartyBankName !== undefined ? { counterpartyBankName: dto.counterpartyBankName.trim() } : {}),
          ...(accountNumber ? {
            counterpartyAccountEncrypted: this.sensitive.encrypt(accountNumber),
            counterpartyAccountMasked: this.sensitive.maskBank(accountNumber),
          } : {}),
          ...(transactionAt ? { transactionAt: new Date(transactionAt) } : {}),
          matchStatus: 'MATCHED',
        },
      });
      await this.createConfirmedAllocations(tx, {
        bankTransactionId: id, projectId, expertProfileId, membershipId, category,
        amount: nextAmount, actorUserId,
      });
      return tx.bankTransaction.findUniqueOrThrow({
        where: { id }, include: { bankAccount: true, allocations: { include: { project: true, expertProfile: { include: { person: true } }, memberDue: { include: { membership: true } } } } },
      });
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'BANK_TRANSACTION', objectId: id,
      beforeData: { amount: before.amount.toString(), counterpartyName: before.counterpartyName },
      afterData: { amount: transaction.amount.toString(), counterpartyName: transaction.counterpartyName },
    });
    return this.withoutCounterpartyAccount(transaction);
  }

  async excludeTransaction(id: string, actorUserId: string, user?: AuthUser) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true, memberDueId: true } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
    await this.assertTransactionScope(id, user);
    const dueIds = [...new Set(before.allocations.flatMap((item) => item.memberDueId ? [item.memberDueId] : []))];
    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.bankAllocation.updateMany({
        where: { bankTransactionId: id, status: 'CONFIRMED' },
        data: { status: 'REVERSED' },
      });
      for (const dueId of dueIds) await this.updateDueStatus(tx, dueId);
      return tx.bankTransaction.update({
        where: { id }, data: { settlementApplicable: false, matchStatus: 'EXCLUDED' },
        include: { bankAccount: true, allocations: true },
      });
    });
    await this.audit.record({
      actorUserId, action: 'DELETE', objectType: 'BANK_TRANSACTION', objectId: id,
      beforeData: { matchStatus: before.matchStatus }, afterData: { matchStatus: transaction.matchStatus },
    });
    return this.withoutCounterpartyAccount(transaction);
  }

  private async updateDueStatus(tx: Prisma.TransactionClient, dueId: string) {
    const [due, aggregate] = await Promise.all([
      tx.memberDue.findUniqueOrThrow({ where: { id: dueId } }),
      tx.bankAllocation.aggregate({
        where: { memberDueId: dueId, status: 'CONFIRMED' }, _sum: { allocatedAmount: true },
      }),
    ]);
    const paid = Number(aggregate._sum.allocatedAmount ?? 0);
    await tx.memberDue.update({
      where: { id: dueId },
      data: { status: paid <= 0 ? 'UNPAID' : paid + 0.001 >= Number(due.amountDue) ? 'PAID' : 'PARTIAL' },
    });
  }

  private normalizeAccountNumber(value: string) {
    return value.replace(/\s+/g, '').trim();
  }

  private async ensureAccountNumberAvailable(accountNumber: string, excludeId?: string) {
    const duplicate = await this.prisma.bankAccount.findFirst({
      where: { accountNumberHash: this.sensitive.hash(accountNumber), ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('银行账号已存在');
  }

  private async requireActiveBankAccount(id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!account) throw new NotFoundException('本方银行账户不存在或已停用');
  }

  private async requireActiveProject(id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!project) throw new NotFoundException('关联项目不存在或已结项');
  }

  private async requireActiveExpert(id: string) {
    const expert = await this.prisma.expertProfile.findFirst({
      where: { id, status: 'ACTIVE', reviewStatus: 'APPROVED' }, select: { id: true },
    });
    if (!expert) throw new NotFoundException('专家不存在、未通过复核或已停用');
  }

  private async requireActiveMembership(id: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!membership) throw new NotFoundException('会员不存在或已停用');
  }

  private async validateAssociation(category: AllocationCategory, projectId?: string, expertProfileId?: string, membershipId?: string, user?: AuthUser) {
    if (category === 'MEMBER_DUE') {
      if (projectId) throw new BadRequestException('会员会费收入不能关联项目');
      if (!membershipId) throw new BadRequestException('请选择缴纳会费的会员');
      if (expertProfileId) throw new BadRequestException('会员会费收入不能关联专家');
      await this.requireActiveMembership(membershipId);
      if (user?.role === 'PM') {
        const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, pmUserId: user.projectManagerId ?? '__unbound_pm__' }, select: { id: true } });
        if (!membership) throw new NotFoundException('关联业务数据不存在或不属于当前 PM');
      }
      return;
    }
    if (!projectId) throw new BadRequestException('请选择关联项目');
    await this.requireActiveProject(projectId);
    if (membershipId) throw new BadRequestException('项目资金流水不能关联会员');
    if (category === 'EXPERT_FEE') {
      if (!expertProfileId) throw new BadRequestException('请选择收款专家');
      await this.requireActiveExpert(expertProfileId);
    } else if (expertProfileId) {
      throw new BadRequestException('只有专家费支出可以关联专家');
    }
    if (user?.role === 'PM') {
      const pmUserId = user.projectManagerId ?? '__unbound_pm__';
      const project = await this.prisma.project.findFirst({ where: { id: projectId, pmUserId }, select: { id: true } });
      const expert = category === 'EXPERT_FEE'
        ? await this.prisma.expertProfile.findFirst({ where: { id: expertProfileId, formOwnerId: pmUserId }, select: { id: true } })
        : true;
      if (!project || !expert) throw new NotFoundException('关联业务数据不存在或不属于当前 PM');
    }
  }

  private async assertTransactionScope(id: string, user?: AuthUser) {
    if (user?.role !== 'PM') return;
    const pmUserId = user.projectManagerId ?? '__unbound_pm__';
    const transaction = await this.prisma.bankTransaction.findFirst({ where: { id, allocations: { some: { OR: [
      { project: { pmUserId } }, { expertProfile: { formOwnerId: pmUserId } }, { memberDue: { membership: { pmUserId } } },
    ] } } }, select: { id: true } });
    if (!transaction) throw new NotFoundException('银行流水不存在或不属于当前 PM');
  }

  private async createConfirmedAllocations(tx: Prisma.TransactionClient, input: {
    bankTransactionId: string;
    projectId?: string;
    expertProfileId?: string;
    membershipId?: string;
    category: AllocationCategory;
    amount: number;
    actorUserId: string;
  }) {
    if (input.category === 'MEMBER_DUE') {
      await this.allocateMemberPayment(tx, input);
      return;
    }
    await tx.bankAllocation.create({
      data: {
        bankTransactionId: input.bankTransactionId,
        projectId: input.projectId,
        expertProfileId: input.category === 'EXPERT_FEE' ? input.expertProfileId : undefined,
        category: input.category,
        allocatedAmount: input.amount.toFixed(2),
        status: 'CONFIRMED', confirmedBy: input.actorUserId, confirmedAt: new Date(),
      },
    });
  }

  private async allocateMemberPayment(tx: Prisma.TransactionClient, input: {
    bankTransactionId: string;
    membershipId?: string;
    category: AllocationCategory;
    amount: number;
    actorUserId: string;
  }) {
    const membership = await tx.membership.findFirst({
      where: { id: input.membershipId, status: 'ACTIVE' },
      select: {
        id: true,
        dues: {
          where: { status: { in: ['UNPAID', 'PARTIAL'] } },
          select: { id: true, amountDue: true, allocations: { where: { status: 'CONFIRMED' }, select: { allocatedAmount: true } } },
          orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!membership) throw new NotFoundException('会员不存在或已停用');
    let remaining = Math.round(input.amount * 100) / 100;
    const allocations: Array<{ dueId: string; amount: number }> = [];
    for (const due of membership.dues) {
      const paid = due.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
      const outstanding = Math.max(0, Math.round((Number(due.amountDue) - paid) * 100) / 100);
      if (outstanding <= 0) continue;
      const allocated = Math.min(remaining, outstanding);
      allocations.push({ dueId: due.id, amount: allocated });
      remaining = Math.round((remaining - allocated) * 100) / 100;
      if (remaining <= 0) break;
    }
    if (remaining > 0 || allocations.length === 0) throw new BadRequestException('流水金额超过该会员未缴会费总额，或该会员暂无未缴会费');
    for (const allocation of allocations) {
      await tx.bankAllocation.create({
        data: {
          bankTransactionId: input.bankTransactionId,
          memberDueId: allocation.dueId,
          category: input.category,
          allocatedAmount: allocation.amount.toFixed(2),
          status: 'CONFIRMED', confirmedBy: input.actorUserId, confirmedAt: new Date(),
        },
      });
      await this.updateDueStatus(tx, allocation.dueId);
    }
  }

  private validateCategory(direction: 'IN' | 'OUT', category: AllocationCategory) {
    if (!supportedCategories.includes(category)) throw new BadRequestException('资金分类仅支持支持款收入、会员会费收入、执行款支出和专家费支出');
    if (direction === 'IN' && expenseCategories.includes(category)) throw new BadRequestException('收入流水不能选择支出资金分类');
    if (direction === 'OUT' && incomeCategories.includes(category)) throw new BadRequestException('支出流水不能选择收入资金分类');
  }

  private withoutCounterpartyAccount<T extends { counterpartyAccountEncrypted?: string | null }>(transaction: T) {
    const { counterpartyAccountEncrypted: _encrypted, ...publicTransaction } = transaction;
    return publicTransaction;
  }
}

function requiredImportValue(value: string, label: string) {
  if (!value.trim()) throw new BadRequestException(`${label}不能为空`);
  return value.trim();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '导入失败';
}

function csvValue(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function calculateExpertIndividualIncomeTax(paymentAmount: number) {
  const taxableAmount = paymentAmount <= 4000 ? paymentAmount - 800 : paymentAmount * 0.8;
  const tax = Math.max(
    taxableAmount * 0.2,
    taxableAmount * 0.3 - 2000,
    taxableAmount * 0.4 - 7000,
    0,
  );
  return Math.round((tax + Number.EPSILON) * 100) / 100;
}
