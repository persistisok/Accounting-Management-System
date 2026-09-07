import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SensitiveDataService } from '../common/sensitive-data.service';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { normalizeImportDate, parseCsv } from '../common/csv-import';
import { CreateExpertDto, ExpertListQueryDto, ReviewExpertDto, UpdateExpertDto } from './experts.dto';

const EXPERT_IMPORT_HEADERS = ['姓名', '单位', '职称', '职务', '专业/科室', '邮箱', '手机', '身份证号码', '开户行', '银行账号', '入库时间', '对接PM'] as const;

export interface ExpertImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
}

@Injectable()
export class ExpertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitive: SensitiveDataService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ExpertListQueryDto, user?: AuthUser) {
    if (query.paymentFrom && query.paymentTo && query.paymentFrom > query.paymentTo) {
      throw new BadRequestException('专家费统计结束日期不能早于起始日期');
    }
    const where: Prisma.ExpertProfileWhereInput = {
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(user?.role === 'PM'
        ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' }
        : query.pmUserId ? { formOwnerId: query.pmUserId } : {}),
      ...(query.q ? { person: { name: { contains: query.q, mode: 'insensitive' } } } : {}),
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
    const expertIds = items.map((item) => item.id);
    const paymentStats = expertIds.length ? await this.prisma.bankAllocation.groupBy({
      by: ['expertProfileId'],
      where: {
        expertProfileId: { in: expertIds }, category: 'EXPERT_FEE', status: 'CONFIRMED',
        ...(query.paymentFrom || query.paymentTo ? { bankTransaction: { transactionAt: {
          ...(query.paymentFrom ? { gte: new Date(query.paymentFrom) } : {}),
          ...(query.paymentTo ? { lte: new Date(query.paymentTo) } : {}),
        } } } : {}),
      },
      _count: { _all: true },
      _sum: { allocatedAmount: true },
    }) : [];
    const paymentStatsByExpert = new Map(paymentStats.map((item) => [item.expertProfileId, {
      count: item._count._all,
      amount: item._sum.allocatedAmount?.toFixed(2) ?? '0.00',
    }]));
    return {
      items: items.map((item) => ({
        ...item,
        paymentCount: paymentStatsByExpert.get(item.id)?.count ?? 0,
        paymentAmount: paymentStatsByExpert.get(item.id)?.amount ?? '0.00',
        credentials: credentials.filter((credential) => credential.objectId === item.id).map((credential) => ({
          id: credential.id,
          fileName: credential.fileName,
          contentType: credential.contentType,
          sizeBytes: credential.sizeBytes.toString(),
          createdAt: credential.createdAt,
        })),
      })),
      total,
      paymentFrom: query.paymentFrom ?? null,
      paymentTo: query.paymentTo ?? null,
    };
  }

  options(user?: AuthUser) {
    return this.prisma.expertProfile.findMany({
      where: {
        reviewStatus: 'APPROVED', status: 'ACTIVE',
        ...(user?.role === 'PM' ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } : {}),
      },
      select: { id: true, person: { select: { name: true, organizationName: true } } },
      orderBy: { person: { name: 'asc' } },
    });
  }

  importTemplate() {
    const example = ['张三', '示例医院', '主任医师', '科室主任', '心内科', 'zhangsan@example.com', '13800138000', '310101199001011234', '中国银行上海分行', '6222000000000000', '2026/08/18', '张项目'];
    return Buffer.from(`\uFEFF${EXPERT_IMPORT_HEADERS.join(',')}\r\n${example.join(',')}\r\n`, 'utf8');
  }

  async importExperts(file: { buffer: Buffer; originalname: string }, user: AuthUser): Promise<ExpertImportResult> {
    if (!file.originalname.toLowerCase().endsWith('.csv')) throw new BadRequestException('仅支持 CSV 格式的专家导入文件');
    const rows = parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, '')).filter((row) => row.some((cell) => cell.trim()));
    if (!rows.length) throw new BadRequestException('CSV 文件为空');
    const headers = rows[0]!.map((header) => header.trim());
    if (headers.length !== EXPERT_IMPORT_HEADERS.length || EXPERT_IMPORT_HEADERS.some((header, index) => headers[index] !== header)) {
      throw new BadRequestException(`CSV 表头应为：${EXPERT_IMPORT_HEADERS.join('、')}`);
    }
    const dataRows = rows.slice(1);
    if (!dataRows.length) throw new BadRequestException('CSV 文件没有可导入的数据');
    if (dataRows.length > 1000) throw new BadRequestException('单次最多导入 1000 位专家');

    const activePms = await this.prisma.projectManager.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, displayName: true },
    });
    const pmByName = new Map<string, Array<{ id: string }>>();
    for (const pm of activePms) pmByName.set(pm.displayName.trim(), [...(pmByName.get(pm.displayName.trim()) ?? []), pm]);

    let successCount = 0;
    const errors: ExpertImportResult['errors'] = [];
    for (let index = 0; index < dataRows.length; index += 1) {
      const rowNumber = index + 2;
      const cells = dataRows[index]!.map((cell) => cell.trim());
      try {
        if (cells.length > EXPERT_IMPORT_HEADERS.length) throw new BadRequestException('列数超过模板定义，请检查逗号或引号');
        const [name, organizationName, professionalTitle, position, department, email, phone, idNumber, bankName, bankAccount, joinedOn, pmName] = cells;
        if (!name) throw new BadRequestException('姓名不能为空');
        const lengthLimits: Array<[string | undefined, string, number]> = [
          [name, '姓名', 100], [organizationName, '单位', 200], [professionalTitle, '职称', 100],
          [position, '职务', 100], [department, '专业/科室', 100], [phone, '手机', 30],
          [idNumber, '身份证号码', 32], [bankName, '开户行', 200], [bankAccount, '银行账号', 64],
        ];
        for (const [value, label, max] of lengthLimits) {
          if (value && value.length > max) throw new BadRequestException(`${label}不能超过 ${max} 个字符`);
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确');

        let formOwnerId = user.role === 'PM' ? user.projectManagerId : undefined;
        if (user.role !== 'PM') {
          if (!pmName) throw new BadRequestException('对接 PM 不能为空');
          const matches = pmByName.get(pmName) ?? [];
          if (!matches.length) throw new BadRequestException(`未找到在职 PM“${pmName}”`);
          if (matches.length > 1) throw new BadRequestException(`PM 姓名“${pmName}”重复，无法唯一匹配`);
          formOwnerId = matches[0]!.id;
        }
        if (!formOwnerId) throw new BadRequestException('当前 PM 账号未绑定 PM');

        await this.create({
          name,
          organizationName: organizationName || undefined,
          professionalTitle: professionalTitle || undefined,
          position: position || undefined,
          department: department || undefined,
          email: email || undefined,
          phone: phone || undefined,
          idNumber: idNumber || undefined,
          bankName: bankName || undefined,
          bankAccount: bankAccount || undefined,
          joinedOn: joinedOn ? normalizeImportDate(joinedOn, '入库时间') : undefined,
          formOwnerId,
        }, user.id, user);
        successCount += 1;
      } catch (error) {
        const response = error && typeof error === 'object' && 'getResponse' in error
          ? (error as { getResponse: () => string | { message?: string | string[] } }).getResponse()
          : undefined;
        const message = typeof response === 'string' ? response : Array.isArray(response?.message) ? response.message.join('；') : response?.message;
        errors.push({ row: rowNumber, message: message ?? (error instanceof Error ? error.message : '导入失败') });
      }
    }
    return { total: dataRows.length, successCount, failureCount: errors.length, errors };
  }

  async paymentDetails(id: string, actorUserId: string, user?: AuthUser) {
    const expert = await this.prisma.expertProfile.findFirst({
      where: { id, reviewStatus: 'APPROVED', status: 'ACTIVE', ...(user?.role === 'PM' ? { formOwnerId: user.projectManagerId ?? '__unbound_pm__' } : {}) },
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

  async create(dto: CreateExpertDto, actorUserId: string, user?: AuthUser) {
    const formOwnerId = user?.role === 'PM' ? user.projectManagerId : dto.formOwnerId;
    if (!formOwnerId) throw new NotFoundException('PM 账号必须绑定 PM');
    await this.requireActivePm(formOwnerId);
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
        formOwner: { connect: { id: formOwnerId } },
      },
      include: { person: true, formOwner: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorUserId, action: 'CREATE', objectType: 'EXPERT', objectId: expert.id,
      afterData: { name: expert.person.name, reviewStatus: expert.reviewStatus },
    });
    return expert;
  }

  async update(id: string, dto: UpdateExpertDto, actorUserId: string, user?: AuthUser) {
    const before = user?.role === 'PM'
      ? await this.prisma.expertProfile.findFirst({ where: { id, formOwnerId: user.projectManagerId ?? '__unbound_pm__' }, include: { person: true } })
      : await this.prisma.expertProfile.findUnique({ where: { id }, include: { person: true } });
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
        ...(user?.role === 'PM' ? { formOwner: { connect: { id: user.projectManagerId! } } } : dto.formOwnerId ? { formOwner: { connect: { id: dto.formOwnerId } } } : {}),
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

  async sensitiveDetails(id: string, actorUserId: string, user?: AuthUser) {
    const selection = {
        id: true, status: true, bankAccountEncrypted: true,
        person: { select: { name: true, phoneEncrypted: true, idNumberEncrypted: true } },
    } satisfies Prisma.ExpertProfileSelect;
    const expert = user?.role === 'PM'
      ? await this.prisma.expertProfile.findFirst({ where: { id, formOwnerId: user.projectManagerId ?? '__unbound_pm__' }, select: selection })
      : await this.prisma.expertProfile.findUnique({ where: { id }, select: selection });
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

  async deactivate(id: string, actorUserId: string, user?: AuthUser) {
    const before = user?.role === 'PM'
      ? await this.prisma.expertProfile.findFirst({ where: { id, formOwnerId: user.projectManagerId ?? '__unbound_pm__' } })
      : await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('专家不存在');
    if (before.status === 'INACTIVE') throw new BadRequestException('专家已停用，不能重复操作');
    if (before.reviewStatus !== 'APPROVED') throw new BadRequestException('只有已通过专家可以停用');
    const expert = await this.prisma.expertProfile.update({ where: { id }, data: { status: 'INACTIVE' }, include: { person: true } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'EXPERT', objectId: id, beforeData: { status: before.status }, afterData: { status: expert.status } });
    return expert;
  }

  async review(id: string, dto: ReviewExpertDto, actorUserId: string, user?: AuthUser) {
    const before = user?.role === 'PM'
      ? await this.prisma.expertProfile.findFirst({ where: { id, formOwnerId: user.projectManagerId ?? '__unbound_pm__' } })
      : await this.prisma.expertProfile.findUnique({ where: { id } });
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

  async assertScope(id: string, user: AuthUser) {
    if (user.role !== 'PM') return;
    const expert = await this.prisma.expertProfile.findFirst({ where: { id, formOwnerId: user.projectManagerId ?? '__unbound_pm__' }, select: { id: true } });
    if (!expert) throw new NotFoundException('专家不存在或不属于当前 PM');
  }

  private async requireActivePm(id: string) {
    const pm = await this.prisma.projectManager.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
    if (!pm) throw new NotFoundException('填表人 PM 不存在或已停用');
  }
}
