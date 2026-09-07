import { ArchiveChecklistStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectReviewDecision } from '../projects/projects.dto';
import { archiveChecklistDefinitions, blockingArchiveItemKeys } from './archive-checklist';
import { ProjectArchiveService } from './project-archive.service';

describe('archive checklist definitions', () => {
  it('contains the complete business checklist and excludes only other from archive blocking', () => {
    expect(archiveChecklistDefinitions).toHaveLength(30);
    expect(blockingArchiveItemKeys).toHaveLength(29);
    expect(archiveChecklistDefinitions.filter((item) => item.requirement === 'CONDITIONAL')).toHaveLength(4);
    expect(blockingArchiveItemKeys).not.toContain('OTHER');
  });
});

describe('ProjectArchiveService review', () => {
  it('requires a rejection reason and records the reviewer', async () => {
    const item = { id: 'item-1', projectId: 'project-1', itemKey: 'PROJECT_PLAN', status: ArchiveChecklistStatus.PENDING };
    const prisma = {
      projectArchiveItem: { findUnique: vi.fn(async () => item), update: vi.fn(async ({ data }) => ({ ...item, ...data })) },
    };
    const audit = { record: vi.fn() };
    const service = new ProjectArchiveService(prisma as never, audit as never);
    const user = { id: 'admin-1', role: 'ADMIN', projectManagerId: null, projectIds: [], permissions: [] } as never;

    await expect(service.review('project-1', 'PROJECT_PLAN', ProjectReviewDecision.REJECTED, '', user)).rejects.toThrow('必须填写');
    await service.review('project-1', 'PROJECT_PLAN', ProjectReviewDecision.REJECTED, '材料缺少签章', user);

    expect(prisma.projectArchiveItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: ArchiveChecklistStatus.REJECTED, rejectionReason: '材料缺少签章', reviewerId: 'admin-1',
    }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVIEW_ARCHIVE_ITEM' }));
  });
});
