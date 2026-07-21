import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AllocationCategory, MatchStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateAllocationDto, CreateTransactionDto, TransactionListQueryDto, UpdateTransactionDto } from './banking.dto';

const incomeCategories: AllocationCategory[] = ['SUPPORT_RECEIPT', 'MEMBER_DUE'];
const expenseCategories: AllocationCategory[] = ['EXECUTION_PAYMENT', 'EXPERT_FEE'];

@Injectable()
export class BankingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  accounts() {
    return this.prisma.bankAccount.findMany({ where: { status: 'ACTIVE' }, orderBy: { accountName: 'asc' } });
  }

  async list(query: TransactionListQueryDto) {
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.matchStatus ? { matchStatus: query.matchStatus as MatchStatus } : {}),
      ...(query.q ? { OR: [
        { transactionNo: { contains: query.q, mode: 'insensitive' } },
        { counterpartyName: { contains: query.q, mode: 'insensitive' } },
        { nature: { contains: query.q, mode: 'insensitive' } },
        { allocations: { some: { project: { projectCode: { contains: query.q, mode: 'insensitive' } } } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { accountName: true, accountNumberMasked: true } },
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
    return { items, total };
  }

  async createTransaction(dto: CreateTransactionDto, actorUserId: string) {
    if (Number(dto.amount) <= 0) throw new BadRequestException('流水金额必须大于零');
    const transaction = await this.prisma.bankTransaction.create({
      data: {
        ...dto,
        transactionAt: new Date(dto.transactionAt),
        settlementApplicable: dto.settlementApplicable ?? true,
        sourceType: dto.sourceType ?? 'MANUAL',
        matchStatus: dto.settlementApplicable === false ? 'EXCLUDED' : 'UNMATCHED',
      },
      include: { bankAccount: true, allocations: true },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'BANK_TRANSACTION', objectId: transaction.id,
      afterData: { direction: transaction.direction, amount: transaction.amount.toString(), counterpartyName: transaction.counterpartyName },
    });
    return transaction;
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto, actorUserId: string) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
    if (before.sourceType !== 'MANUAL') throw new BadRequestException('导入的原始流水不能编辑');
    if (!before.settlementApplicable) throw new BadRequestException('已排除的流水不能编辑');
    if (before.allocations.length) throw new BadRequestException('已有分配的流水不能编辑，请先撤销全部分配');
    if (dto.amount !== undefined && Number(dto.amount) <= 0) throw new BadRequestException('流水金额必须大于零');
    const transaction = await this.prisma.bankTransaction.update({
      where: { id },
      data: { ...dto, ...(dto.transactionAt ? { transactionAt: new Date(dto.transactionAt) } : {}), matchStatus: 'UNMATCHED' },
      include: { bankAccount: true, allocations: true },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'BANK_TRANSACTION', objectId: id,
      beforeData: { amount: before.amount.toString(), counterpartyName: before.counterpartyName },
      afterData: { amount: transaction.amount.toString(), counterpartyName: transaction.counterpartyName },
    });
    return transaction;
  }

  async excludeTransaction(id: string, actorUserId: string) {
    const before = await this.prisma.bankTransaction.findUnique({
      where: { id }, include: { allocations: { where: { status: 'CONFIRMED' }, select: { id: true } } },
    });
    if (!before) throw new NotFoundException('银行流水不存在');
    if (before.allocations.length) throw new BadRequestException('已有分配的流水不能删除，请先撤销全部分配');
    const transaction = await this.prisma.bankTransaction.update({
      where: { id }, data: { settlementApplicable: false, matchStatus: 'EXCLUDED' },
      include: { bankAccount: true, allocations: true },
    });
    await this.audit.record({
      actorUserId, action: 'DELETE', objectType: 'BANK_TRANSACTION', objectId: id,
      beforeData: { matchStatus: before.matchStatus }, afterData: { matchStatus: transaction.matchStatus },
    });
    return transaction;
  }

  async allocate(transactionId: string, dto: CreateAllocationDto, actorUserId: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId }, include: { allocations: { where: { status: { not: 'REVERSED' } } } },
    });
    if (!transaction) throw new NotFoundException('银行流水不存在');
    if (!transaction.settlementApplicable) throw new BadRequestException('该流水已标记为不适用结算');
    const amount = Number(dto.allocatedAmount);
    if (amount <= 0) throw new BadRequestException('分配金额必须大于零');
    const allocated = transaction.allocations.reduce((sum, item) => sum + Number(item.allocatedAmount), 0);
    if (allocated + amount > Number(transaction.amount) + 0.001) {
      throw new BadRequestException(`分配金额超过流水可分配余额，当前最多可分配 ${(Number(transaction.amount) - allocated).toFixed(2)}`);
    }
    if (transaction.direction === 'IN' && expenseCategories.includes(dto.category)) {
      throw new BadRequestException('收入流水不能分配为支出分类');
    }
    if (transaction.direction === 'OUT' && incomeCategories.includes(dto.category)) {
      throw new BadRequestException('支出流水不能分配为收入分类');
    }
    if (['SUPPORT_RECEIPT', 'EXECUTION_PAYMENT', 'EXPERT_FEE'].includes(dto.category) && !dto.projectId) {
      throw new BadRequestException('该分类必须关联项目');
    }
    if (dto.category === 'EXPERT_FEE' && !dto.expertProfileId) throw new BadRequestException('专家费必须关联专家');
    if (dto.category === 'MEMBER_DUE' && !dto.memberDueId) throw new BadRequestException('会费必须关联会费应收记录');

    const allocation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankAllocation.create({
        data: {
          bankTransactionId: transactionId,
          ...dto,
          status: 'CONFIRMED',
          confirmedBy: actorUserId,
          confirmedAt: new Date(),
        },
        include: { project: true, expertProfile: { include: { person: true } }, memberDue: true },
      });
      const newAllocated = allocated + amount;
      await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { matchStatus: Math.abs(newAllocated - Number(transaction.amount)) < 0.001 ? 'MATCHED' : 'PARTIAL' },
      });
      if (dto.memberDueId) await this.updateDueStatus(tx, dto.memberDueId);
      return created;
    });
    await this.audit.record({
      actorUserId, action: 'CONFIRM', objectType: 'BANK_ALLOCATION', objectId: allocation.id,
      afterData: { category: allocation.category, allocatedAmount: allocation.allocatedAmount.toString(), projectId: allocation.projectId },
    });
    return allocation;
  }

  async reverse(allocationId: string, actorUserId: string) {
    const allocation = await this.prisma.bankAllocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw new NotFoundException('流水分配不存在');
    if (allocation.status === 'REVERSED') return allocation;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bankAllocation.update({ where: { id: allocationId }, data: { status: 'REVERSED' } });
      const remaining = await tx.bankAllocation.aggregate({
        where: { bankTransactionId: allocation.bankTransactionId, status: 'CONFIRMED' },
        _sum: { allocatedAmount: true },
      });
      const transaction = await tx.bankTransaction.findUniqueOrThrow({ where: { id: allocation.bankTransactionId } });
      const value = Number(remaining._sum.allocatedAmount ?? 0);
      await tx.bankTransaction.update({
        where: { id: transaction.id },
        data: { matchStatus: value === 0 ? 'UNMATCHED' : Math.abs(value - Number(transaction.amount)) < 0.001 ? 'MATCHED' : 'PARTIAL' },
      });
      if (allocation.memberDueId) await this.updateDueStatus(tx, allocation.memberDueId);
      return row;
    });
    await this.audit.record({ actorUserId, action: 'REVERSE', objectType: 'BANK_ALLOCATION', objectId: allocationId });
    return updated;
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
}
