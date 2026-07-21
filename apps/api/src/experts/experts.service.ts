import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import { CreateExpertDto, ExpertListQueryDto, ReviewExpertDto, UpdateExpertDto } from './experts.dto';

@Injectable()
export class ExpertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitive: SensitiveDataService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ExpertListQueryDto) {
    const where: Prisma.ExpertProfileWhereInput = {
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { person: { OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { organizationName: { contains: query.q, mode: 'insensitive' } },
        { department: { contains: query.q, mode: 'insensitive' } },
      ] } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expertProfile.findMany({
        where,
        select: {
          id: true, professionalTitle: true, bankName: true, bankAccountMasked: true,
          joinedOn: true, reviewStatus: true, status: true, createdAt: true,
          person: { select: {
            id: true, name: true, phoneMasked: true, idNumberMasked: true, email: true,
            organizationName: true, department: true, position: true,
          } },
          formOwner: { select: { id: true, displayName: true } },
          reviewer: { select: { id: true, displayName: true } },
        },
        orderBy: { joinedOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.expertProfile.count({ where }),
    ]);
    return { items, total };
  }

  options() {
    return this.prisma.expertProfile.findMany({
      where: { reviewStatus: 'APPROVED', status: 'ACTIVE' },
      select: { id: true, person: { select: { name: true, organizationName: true } } },
      orderBy: { person: { name: 'asc' } },
    });
  }

  async create(dto: CreateExpertDto, actorUserId: string) {
    const idNumberHash = this.sensitive.hash(dto.idNumber);
    if (idNumberHash && await this.prisma.person.findUnique({ where: { idNumberHash } })) {
      throw new ConflictException('该证件号码对应的专家已存在');
    }
    const expert = await this.prisma.expertProfile.create({
      data: {
        person: {
          create: {
            name: dto.name,
            phoneEncrypted: this.sensitive.encrypt(dto.phone),
            phoneMasked: this.sensitive.maskPhone(dto.phone),
            idNumberEncrypted: this.sensitive.encrypt(dto.idNumber),
            idNumberHash,
            idNumberMasked: this.sensitive.maskId(dto.idNumber),
            email: dto.email,
            organizationName: dto.organizationName,
            department: dto.department,
            position: dto.position,
          },
        },
        professionalTitle: dto.professionalTitle,
        bankName: dto.bankName,
        bankAccountEncrypted: this.sensitive.encrypt(dto.bankAccount),
        bankAccountMasked: this.sensitive.maskBank(dto.bankAccount),
        joinedOn: dto.joinedOn ? new Date(dto.joinedOn) : new Date(),
        formOwner: { connect: { id: actorUserId } },
      },
      include: { person: true, formOwner: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'EXPERT', objectId: expert.id,
      afterData: { name: expert.person.name, reviewStatus: expert.reviewStatus },
    });
    return expert;
  }

  async update(id: string, dto: UpdateExpertDto, actorUserId: string) {
    const before = await this.prisma.expertProfile.findUnique({ where: { id }, include: { person: true } });
    if (!before) throw new NotFoundException('专家不存在');
    const idNumberHash = dto.idNumber ? this.sensitive.hash(dto.idNumber) : undefined;
    if (idNumberHash) {
      const duplicate = await this.prisma.person.findFirst({ where: { idNumberHash, id: { not: before.personId } }, select: { id: true } });
      if (duplicate) throw new ConflictException('该证件号码对应的专家已存在');
    }
    const expert = await this.prisma.expertProfile.update({
      where: { id },
      data: {
        ...(dto.professionalTitle !== undefined ? { professionalTitle: dto.professionalTitle || null } : {}),
        ...(dto.bankName !== undefined ? { bankName: dto.bankName || null } : {}),
        ...(dto.bankAccount ? { bankAccountEncrypted: this.sensitive.encrypt(dto.bankAccount), bankAccountMasked: this.sensitive.maskBank(dto.bankAccount) } : {}),
        ...(dto.joinedOn ? { joinedOn: new Date(dto.joinedOn) } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        person: { update: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.phone ? { phoneEncrypted: this.sensitive.encrypt(dto.phone), phoneMasked: this.sensitive.maskPhone(dto.phone) } : {}),
          ...(dto.idNumber ? { idNumberEncrypted: this.sensitive.encrypt(dto.idNumber), idNumberHash, idNumberMasked: this.sensitive.maskId(dto.idNumber) } : {}),
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(dto.organizationName !== undefined ? { organizationName: dto.organizationName || null } : {}),
          ...(dto.department !== undefined ? { department: dto.department || null } : {}),
          ...(dto.position !== undefined ? { position: dto.position || null } : {}),
        } },
      },
      include: { person: true, formOwner: { select: { id: true, displayName: true } }, reviewer: { select: { id: true, displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'EXPERT', objectId: id,
      beforeData: { name: before.person.name, status: before.status }, afterData: { name: expert.person.name, status: expert.status },
    });
    return expert;
  }

  async deactivate(id: string, actorUserId: string) {
    const before = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专家不存在');
    const expert = await this.prisma.expertProfile.update({ where: { id }, data: { status: 'INACTIVE' }, include: { person: true } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'EXPERT', objectId: id, beforeData: { status: before.status }, afterData: { status: expert.status } });
    return expert;
  }

  async review(id: string, dto: ReviewExpertDto, actorUserId: string) {
    const before = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专家不存在');
    const expert = await this.prisma.expertProfile.update({
      where: { id }, data: { reviewStatus: dto.reviewStatus, reviewerId: dto.reviewerId },
      include: { person: true, reviewer: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'EXPERT', objectId: id,
      beforeData: { reviewStatus: before.reviewStatus }, afterData: { reviewStatus: expert.reviewStatus },
    });
    return expert;
  }
}
