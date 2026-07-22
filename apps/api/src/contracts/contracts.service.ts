import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, ContractType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { attachmentMap } from '../attachments/attachment-view';
import { PrismaService } from '../prisma.service';
import { ContractListQueryDto, CreateContractDto, UpdateContractDto } from './contracts.dto';

export function formatInternalContractNo(id: string) {
  return `CTR-${id.toUpperCase()}`;
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: ContractListQueryDto) {
    const where: Prisma.ContractWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [
        { project: { name: { contains: query.q, mode: 'insensitive' } } },
        { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
        { contractEntity: { contains: query.q, mode: 'insensitive' } },
        { counterparty: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          counterparty: { select: { id: true, organizationCode: true, name: true } },
        },
        orderBy: { signedOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);
    const attachments = await attachmentMap(this.prisma, 'CONTRACT', items.map((item) => item.id));
    return { items: items.map((item) => ({ ...item, attachments: attachments[item.id] ?? [] })), total };
  }

  async create(dto: CreateContractDto, actorUserId: string) {
    await this.validateRules(dto);
    const contract = await this.prisma.contract.create({
      data: {
        projectId: dto.projectId,
        contractEntity: dto.contractEntity,
        counterpartyId: dto.counterpartyId,
        amount: dto.amount,
        signedOn: new Date(dto.signedOn),
        contractNo: formatInternalContractNo(randomUUID()),
        contractDirection: dto.contractType === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE',
        contractType: dto.contractType,
        status: ContractStatus.SIGNED,
      },
      include: { project: true, counterparty: true },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'CONTRACT', objectId: contract.id,
      afterData: { contractNo: contract.contractNo, amount: contract.amount.toString(), status: contract.status },
    });
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, actorUserId: string) {
    const before = await this.prisma.contract.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('合同不存在');
    if (before.status === 'VOID' || before.status === 'TERMINATED') throw new BadRequestException('已作废或终止的合同不能编辑');
    const merged = {
      counterpartyId: dto.counterpartyId ?? before.counterpartyId,
      projectId: dto.projectId ?? before.projectId,
      contractType: dto.contractType ?? before.contractType,
      amount: dto.amount ?? before.amount.toString(),
    };
    await this.validateRules(merged);
    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        ...(dto.projectId ? { projectId: dto.projectId } : {}),
        ...(dto.contractType ? {
          contractType: dto.contractType,
          contractDirection: dto.contractType === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE',
        } : {}),
        ...(dto.contractEntity !== undefined ? { contractEntity: dto.contractEntity } : {}),
        ...(dto.counterpartyId ? { counterpartyId: dto.counterpartyId } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.signedOn ? { signedOn: new Date(dto.signedOn) } : {}),
        version: { increment: 1 },
      },
      include: { project: { select: { id: true, projectCode: true, name: true } }, counterparty: true },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'CONTRACT', objectId: id,
      beforeData: { contractNo: before.contractNo, amount: before.amount.toString(), status: before.status },
      afterData: { contractNo: contract.contractNo, amount: contract.amount.toString(), status: contract.status },
    });
    return contract;
  }

  async setStatus(id: string, status: ContractStatus, actorUserId: string) {
    const before = await this.prisma.contract.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('合同不存在');
    const contract = await this.prisma.contract.update({ where: { id }, data: { status, version: { increment: 1 } } });
    await this.audit.record({
      actorUserId, action: status === 'VOID' ? 'VOID' : 'UPDATE', objectType: 'CONTRACT', objectId: id,
      beforeData: { status: before.status }, afterData: { status },
    });
    return contract;
  }

  private async validateRules(dto: { counterpartyId: string; projectId: string; contractType: ContractType; amount: string }) {
    if (Number(dto.amount) <= 0) throw new BadRequestException('合同金额必须大于零');
    const role = await this.prisma.organizationRole.findFirst({
      where: {
        organizationId: dto.counterpartyId,
        roleType: dto.contractType === 'SUPPORT' ? 'SUPPORTER' : 'EXECUTOR',
        reviewStatus: 'APPROVED',
        organization: { status: 'ACTIVE' },
      },
    });
    if (!role) throw new BadRequestException(dto.contractType === 'SUPPORT' ? '请选择有效支持方' : '请选择有效执行方');
  }
}
