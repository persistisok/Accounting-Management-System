import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ContractListQueryDto, CreateContractDto, UpdateContractDto } from './contracts.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: ContractListQueryDto) {
    const where: Prisma.ContractWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractType ? { contractType: query.contractType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [
        { contractNo: { contains: query.q, mode: 'insensitive' } },
        { project: { name: { contains: query.q, mode: 'insensitive' } } },
        { project: { projectCode: { contains: query.q, mode: 'insensitive' } } },
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
    return { items, total };
  }

  async create(dto: CreateContractDto, actorUserId: string) {
    await this.validateBusinessRules(dto);
    const contract = await this.prisma.contract.create({
      data: {
        ...dto,
        signedOn: new Date(dto.signedOn),
        effectiveOn: dto.effectiveOn ? new Date(dto.effectiveOn) : null,
        expiresOn: dto.expiresOn ? new Date(dto.expiresOn) : null,
        status: dto.status ?? ContractStatus.SIGNED,
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
      contractType: dto.contractType ?? before.contractType,
      contractDirection: dto.contractDirection ?? before.contractDirection,
      counterpartyId: dto.counterpartyId ?? before.counterpartyId,
      projectId: dto.projectId ?? before.projectId,
      amount: dto.amount ?? before.amount.toString(),
    };
    await this.validateBusinessRules(merged);
    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.signedOn ? { signedOn: new Date(dto.signedOn) } : {}),
        ...(dto.effectiveOn ? { effectiveOn: new Date(dto.effectiveOn) } : {}),
        ...(dto.expiresOn ? { expiresOn: new Date(dto.expiresOn) } : {}),
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

  private async validateBusinessRules(dto: {
    contractType: string; contractDirection: string; counterpartyId: string; projectId: string; amount: string;
  }) {
    if (Number(dto.amount) <= 0) throw new BadRequestException('合同金额必须大于零');
    const expectedRole = dto.contractType === 'SUPPORT' ? 'SUPPORTER' : dto.contractType === 'EXECUTION' ? 'EXECUTOR' : null;
    if (dto.contractType === 'SUPPORT' && dto.contractDirection !== 'RECEIVABLE') throw new BadRequestException('支持协议必须是应收方向');
    if (dto.contractType === 'EXECUTION' && dto.contractDirection !== 'PAYABLE') throw new BadRequestException('执行协议必须是应付方向');
    if (expectedRole) {
      const role = await this.prisma.organizationRole.findFirst({
        where: { organizationId: dto.counterpartyId, roleType: expectedRole, reviewStatus: 'APPROVED', organization: { status: 'ACTIVE' } },
      });
      if (!role) throw new BadRequestException(expectedRole === 'SUPPORTER' ? '请选择有效支持方' : '请选择有效执行方');
    }
    if (dto.contractType === 'EXECUTION') {
      const candidate = await this.prisma.projectExecutorCandidate.findUnique({
        where: { projectId_organizationId: { projectId: dto.projectId, organizationId: dto.counterpartyId } },
      });
      if (!candidate || candidate.selectionStatus !== 'SELECTED') throw new BadRequestException('只有已中选的执行方可以登记执行协议');
    }
  }
}
