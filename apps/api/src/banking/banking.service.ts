import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AllocationCategory, MatchStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import { BankAccountListQueryDto, CreateBankAccountDto, CreateTransactionDto, TransactionListQueryDto, UpdateBankAccountDto, UpdateTransactionDto } from './banking.dto';

const incomeCategories: AllocationCategory[] = ['SUPPORT_RECEIPT', 'MEMBER_DUE'];
const expenseCategories: AllocationCategory[] = ['EXECUTION_PAYMENT', 'EXPERT_FEE'];
const supportedCategories: AllocationCategory[] = [...incomeCategories, ...expenseCategories];
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

  async list(query: TransactionListQueryDto) {
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.matchStatus ? { matchStatus: query.matchStatus as MatchStatus } : {}),
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

  async createTransaction(dto: CreateTransactionDto, actorUserId: string) {
    if (Number(dto.amount) <= 0) throw new BadRequestException('流水金额必须大于零');
    await this.requireActiveBankAccount(dto.bankAccountId);
    this.validateCategory(dto.direction, dto.category);
    await this.validateAssociation(dto.category, dto.projectId, dto.expertProfileId, dto.membershipId);
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
          sourceType: 'MANUAL',
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

  async updateTransaction(id: string, dto: UpdateTransactionDto, actorUserId: string) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id },
      include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true, projectId: true, memberDueId: true, expertProfileId: true, category: true, allocatedAmount: true, memberDue: { select: { membershipId: true } } } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
    if (before.sourceType !== 'MANUAL') throw new BadRequestException('导入的原始流水不能编辑');
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
    await this.validateAssociation(category, projectId, expertProfileId, membershipId);
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

  async excludeTransaction(id: string, actorUserId: string) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true, memberDueId: true } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
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

  private async validateAssociation(category: AllocationCategory, projectId?: string, expertProfileId?: string, membershipId?: string) {
    if (category === 'MEMBER_DUE') {
      if (projectId) throw new BadRequestException('会员会费收入不能关联项目');
      if (!membershipId) throw new BadRequestException('请选择缴纳会费的会员');
      if (expertProfileId) throw new BadRequestException('会员会费收入不能关联专家');
      await this.requireActiveMembership(membershipId);
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
