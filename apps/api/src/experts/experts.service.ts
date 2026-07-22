import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    const credentials = await this.prisma.attachment.findMany({
      where: { objectType: 'EXPERT_CREDENTIAL', objectId: { in: items.map((item) => item.id) } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((item) => ({
        ...item,
        credentials: credentials.filter((credential) => credential.objectId === item.id).map((credential) => ({
          id: credential.id,
          fileName: credential.fileName,
          contentType: credential.contentType,
          sizeBytes: credential.sizeBytes.toString(),
          createdAt: credential.createdAt,
        })),
      })),
      total,
    };
  }

  options() {
    return this.prisma.expertProfile.findMany({
      where: { reviewStatus: 'APPROVED', status: 'ACTIVE' },
      select: { id: true, person: { select: { name: true, organizationName: true } } },
      orderBy: { person: { name: 'asc' } },
    });
  }

  async paymentDetails(id: string, actorUserId: string) {
    const expert = await this.prisma.expertProfile.findFirst({
      where: { id, reviewStatus: 'APPROVED', status: 'ACTIVE' },
      select: { id: true, bankName: true, bankAccountEncrypted: true, person: { select: { name: true } } },
    });
    if (!expert) throw new NotFoundException('专家不存在或已停用');
    let bankAccount: string | undefined;
    try {
      bankAccount = this.sensitive.decrypt(expert.bankAccountEncrypted);
    } catch {
      bankAccount = undefined;
    }
    await this.audit.record({
      actorUserId, action: 'VIEW_SENSITIVE', objectType: 'EXPERT', objectId: id,
      afterData: { fields: ['bankName', 'bankAccount'], unavailableFields: bankAccount ? [] : ['bankAccount'] },
    });
    return { name: expert.person.name, bankName: expert.bankName ?? '', bankAccount: bankAccount ?? '' };
  }

  async create(dto: CreateExpertDto, actorUserId: string) {
    await this.requireActivePm(dto.formOwnerId);
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
        formOwner: { connect: { id: dto.formOwnerId } },
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
    if (before.status === 'INACTIVE') throw new BadRequestException('已停用专家不能编辑');
    if (dto.formOwnerId) await this.requireActivePm(dto.formOwnerId);
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
        ...(dto.formOwnerId ? { formOwner: { connect: { id: dto.formOwnerId } } } : {}),
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

  async sensitiveDetails(id: string, actorUserId: string) {
    const expert = await this.prisma.expertProfile.findUnique({
      where: { id },
      select: {
        id: true, status: true, bankAccountEncrypted: true,
        person: { select: { name: true, phoneEncrypted: true, idNumberEncrypted: true } },
      },
    });
    if (!expert) throw new NotFoundException('专家不存在');
    if (expert.status === 'INACTIVE') throw new BadRequestException('已停用专家不能查看敏感信息');
    const unavailableFields: string[] = [];
    const decrypt = (value: string | null, field: string) => {
      try {
        return this.sensitive.decrypt(value);
      } catch {
        unavailableFields.push(field);
        return undefined;
      }
    };
    const details = {
      name: expert.person.name,
      phone: decrypt(expert.person.phoneEncrypted, 'phone'),
      idNumber: decrypt(expert.person.idNumberEncrypted, 'idNumber'),
      bankAccount: decrypt(expert.bankAccountEncrypted, 'bankAccount'),
      unavailableFields,
    };
    await this.audit.record({
      actorUserId,
      action: 'VIEW_SENSITIVE',
      objectType: 'EXPERT',
      objectId: id,
      afterData: { fields: ['phone', 'idNumber', 'bankAccount'], unavailableFields },
    });
    return details;
  }

  async deactivate(id: string, actorUserId: string) {
    const before = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专家不存在');
    if (before.status === 'INACTIVE') throw new BadRequestException('专家已停用，不能重复操作');
    if (before.reviewStatus !== 'APPROVED') throw new BadRequestException('只有已通过专家可以停用');
    const expert = await this.prisma.expertProfile.update({ where: { id }, data: { status: 'INACTIVE' }, include: { person: true } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'EXPERT', objectId: id, beforeData: { status: before.status }, afterData: { status: expert.status } });
    return expert;
  }

  async review(id: string, dto: ReviewExpertDto, actorUserId: string) {
    const before = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专家不存在');
    if (before.status === 'INACTIVE') throw new BadRequestException('已停用专家不能复核');
    if (before.reviewStatus !== 'PENDING') throw new BadRequestException('只有待复核专家可以通过或驳回');
    const expert = await this.prisma.expertProfile.update({
      where: { id },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewerId: actorUserId,
        status: dto.reviewStatus === 'REJECTED' ? 'INACTIVE' : 'ACTIVE',
      },
      include: { person: true, reviewer: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'UPDATE', objectType: 'EXPERT', objectId: id,
      beforeData: { reviewStatus: before.reviewStatus, status: before.status },
      afterData: { reviewStatus: expert.reviewStatus, status: expert.status },
    });
    return expert;
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.projectManager.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('填表人 PM 不存在或已停用');
  }
}
