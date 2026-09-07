import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveChecklistStatus } from '@prisma/client';
import { attachmentMap } from '../attachments/attachment-view';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { ProjectReviewDecision } from '../projects/projects.dto';
import { projectScopeFor } from '../projects/projects.service';
import { archiveChecklistDefinitions, archiveDefinition, blockingArchiveItemKeys } from './archive-checklist';

@Injectable()
export class ProjectArchiveService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(projectId: string, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectScopeFor(user) },
      select: { id: true, projectCode: true, name: true, archiveStatus: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    const records = await this.prisma.projectArchiveItem.findMany({
      where: { projectId },
      include: {
        uploader: { select: { id: true, displayName: true } },
        reviewer: { select: { id: true, displayName: true } },
      },
    });
    const attachments = await attachmentMap(this.prisma, 'PROJECT_ARCHIVE_ITEM', records.map((item) => item.id));
    const byKey = new Map(records.map((item) => [item.itemKey, item]));
    const items = archiveChecklistDefinitions.map((definition) => {
      const record = byKey.get(definition.key);
      return {
        ...definition,
        id: record?.id,
        status: record?.status ?? ArchiveChecklistStatus.NOT_UPLOADED,
        notApplicable: record?.notApplicable ?? false,
        notApplicableReason: record?.notApplicableReason,
        rejectionReason: record?.rejectionReason,
        submittedAt: record?.submittedAt,
        reviewedAt: record?.reviewedAt,
        uploader: record?.uploader,
        reviewer: record?.reviewer,
        attachments: record ? attachments[record.id] ?? [] : [],
      };
    });
    return {
      project,
      items,
      summary: {
        total: items.length,
        required: blockingArchiveItemKeys.length,
        notUploaded: items.filter((item) => item.status === ArchiveChecklistStatus.NOT_UPLOADED).length,
        pending: items.filter((item) => item.status === ArchiveChecklistStatus.PENDING).length,
        approved: items.filter((item) => item.status === ArchiveChecklistStatus.APPROVED).length,
        approvedRequired: blockingArchiveItemKeys.filter((key) => byKey.get(key)?.status === ArchiveChecklistStatus.APPROVED).length,
        rejected: items.filter((item) => item.status === ArchiveChecklistStatus.REJECTED).length,
        readyForArchive: blockingArchiveItemKeys.every((key) => byKey.get(key)?.status === ArchiveChecklistStatus.APPROVED),
      },
    };
  }

  async prepare(projectId: string, itemKey: string, user: AuthUser) {
    const definition = this.requireDefinition(itemKey);
    await this.assertPmProject(projectId, user);
    const item = await this.prisma.projectArchiveItem.upsert({
      where: { projectId_itemKey: { projectId, itemKey } },
      create: { projectId, itemKey },
      update: {},
    });
    if (item.status === ArchiveChecklistStatus.APPROVED) throw new BadRequestException('已通过的归档材料不能重新上传');
    if (item.status === ArchiveChecklistStatus.PENDING) throw new BadRequestException('该归档材料正在审核，不能重复提交');
    return { id: item.id, label: definition.label };
  }

  async submit(projectId: string, itemKey: string, user: AuthUser) {
    await this.assertPmProject(projectId, user);
    const item = await this.requireItem(projectId, itemKey);
    if (item.status === ArchiveChecklistStatus.APPROVED) throw new BadRequestException('该归档材料已通过');
    const count = await this.prisma.attachment.count({
      where: {
        objectType: 'PROJECT_ARCHIVE_ITEM', objectId: item.id,
        ...(item.status === ArchiveChecklistStatus.REJECTED && item.reviewedAt ? { createdAt: { gt: item.reviewedAt } } : {}),
      },
    });
    if (!count) throw new BadRequestException(item.status === ArchiveChecklistStatus.REJECTED ? '请重新上传修改后的归档材料' : '请先上传归档材料');
    const updated = await this.prisma.projectArchiveItem.update({
      where: { id: item.id },
      data: {
        status: ArchiveChecklistStatus.PENDING, notApplicable: false, notApplicableReason: null,
        rejectionReason: null, uploadedById: user.id, submittedAt: new Date(), reviewerId: null, reviewedAt: null,
      },
    });
    await this.audit.record({ actorUserId: user.id, action: 'SUBMIT_ARCHIVE_ITEM', objectType: 'PROJECT_ARCHIVE_ITEM', objectId: item.id, afterData: { projectId, itemKey, attachmentCount: count } });
    return updated;
  }

  async markNotApplicable(projectId: string, itemKey: string, reason: string, user: AuthUser) {
    const definition = this.requireDefinition(itemKey);
    if (definition.requirement !== 'CONDITIONAL') throw new BadRequestException('只有条件适用材料可以标记为不适用');
    await this.assertPmProject(projectId, user);
    const item = await this.prisma.projectArchiveItem.upsert({
      where: { projectId_itemKey: { projectId, itemKey } },
      create: { projectId, itemKey }, update: {},
    });
    if (item.status === ArchiveChecklistStatus.APPROVED) throw new BadRequestException('该归档项已通过');
    if (item.status === ArchiveChecklistStatus.PENDING) throw new BadRequestException('该归档项正在审核，不能重复提交');
    const updated = await this.prisma.projectArchiveItem.update({
      where: { id: item.id },
      data: {
        status: ArchiveChecklistStatus.PENDING, notApplicable: true, notApplicableReason: reason.trim(),
        rejectionReason: null, uploadedById: user.id, submittedAt: new Date(), reviewerId: null, reviewedAt: null,
      },
    });
    await this.audit.record({ actorUserId: user.id, action: 'SUBMIT_ARCHIVE_NA', objectType: 'PROJECT_ARCHIVE_ITEM', objectId: item.id, afterData: { projectId, itemKey, reason: reason.trim() } });
    return updated;
  }

  async review(projectId: string, itemKey: string, decision: ProjectReviewDecision, reason: string, user: AuthUser) {
    const item = await this.requireItem(projectId, itemKey);
    if (item.status !== ArchiveChecklistStatus.PENDING) throw new BadRequestException('该归档项不处于待审核状态');
    if (decision === ProjectReviewDecision.REJECTED && reason.trim().length < 2) throw new BadRequestException('驳回时必须填写至少 2 个字的原因');
    const updated = await this.prisma.projectArchiveItem.update({
      where: { id: item.id },
      data: {
        status: decision === ProjectReviewDecision.APPROVED ? ArchiveChecklistStatus.APPROVED : ArchiveChecklistStatus.REJECTED,
        rejectionReason: decision === ProjectReviewDecision.REJECTED ? reason.trim() : null,
        reviewerId: user.id, reviewedAt: new Date(),
      },
    });
    await this.audit.record({ actorUserId: user.id, action: 'REVIEW_ARCHIVE_ITEM', objectType: 'PROJECT_ARCHIVE_ITEM', objectId: item.id, beforeData: { status: item.status }, afterData: { projectId, itemKey, decision, reason: reason.trim() || undefined } });
    return updated;
  }

  private requireDefinition(itemKey: string) {
    const definition = archiveDefinition(itemKey);
    if (!definition) throw new BadRequestException('归档清单项不存在');
    return definition;
  }

  private async requireItem(projectId: string, itemKey: string) {
    this.requireDefinition(itemKey);
    const item = await this.prisma.projectArchiveItem.findUnique({ where: { projectId_itemKey: { projectId, itemKey } } });
    if (!item) throw new NotFoundException('归档清单项尚未提交');
    return item;
  }

  private async assertPmProject(projectId: string, user: AuthUser) {
    if (user.role !== 'PM' && user.role !== 'SYSTEM_ADMIN') throw new BadRequestException('只有项目 PM 可以提交归档材料');
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectScopeFor(user) },
      select: { id: true, archiveStatus: true },
    });
    if (!project) throw new NotFoundException('项目不存在或不属于当前 PM');
    if (project.archiveStatus === 'ARCHIVED') throw new BadRequestException('已归档项目不能修改归档材料');
  }
}
