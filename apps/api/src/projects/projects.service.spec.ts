import { describe, expect, it, vi } from 'vitest';
import { ArchiveStatus, InvoiceDirection, ProjectReviewState, ProjectStatus } from '@prisma/client';
import { roundMoney } from '../common/money';
import { ProjectPeriodUnit } from './projects.dto';
import { buildProjectWhere, formatProjectCode, ProjectsService, projectScopeFor, randomProjectCodeSuffix, toPeriodMonths, validateArchiveRequest, validateStatusRequest } from './projects.service';

describe('money summaries', () => {
  it('keeps two decimal places for financial API values', () => {
    expect(roundMoney(800000 - 600000)).toBe('200000.00');
    expect(roundMoney(0)).toBe('0.00');
  });

  it('summarizes issued and received invoices separately', async () => {
    const prisma = {
      contract: { findMany: async () => [] },
      bankAllocation: { findMany: async () => [] },
      invoice: { findMany: async () => [
        { projectId: 'project-1', direction: InvoiceDirection.ISSUED, kind: 'BLUE', totalAmount: '100.00' },
        { projectId: 'project-1', direction: InvoiceDirection.RECEIVED, kind: 'BLUE', totalAmount: '60.00' },
      ] },
    };
    const invoiceFindMany = vi.spyOn(prisma.invoice, 'findMany');
    const service = new ProjectsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.summary('project-1')).resolves.toMatchObject({
      invoicedAmount: '100.00',
      receivedInvoiceAmount: '60.00',
    });
    expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ direction: true }),
    }));
  });
});

describe('project period normalization', () => {
  it('stores years and months as a canonical month count', () => {
    expect(toPeriodMonths('1', ProjectPeriodUnit.YEAR)).toBe(12);
    expect(toPeriodMonths('3', ProjectPeriodUnit.MONTH)).toBe(3);
  });

  it('rejects zero and fractional periods', () => {
    expect(() => toPeriodMonths('0', ProjectPeriodUnit.MONTH)).toThrow('项目周期必须是');
    expect(() => toPeriodMonths('1.5', ProjectPeriodUnit.YEAR)).toThrow('项目周期必须是');
  });
});

describe('project code formatting', () => {
  it('combines platform, year, month, sequence and a five-letter suffix', () => {
    expect(formatProjectCode('sl', 2026, 7, 1, 'OCHWK')).toBe('SL260701OCHWK');
    expect(formatProjectCode('SL', 2026, 7, 99, 'ABCDE')).toBe('SL260799ABCDE');
    expect(formatProjectCode('SL', 2026, 7, 100, 'ABCDE')).toBe('SL2607100ABCDE');
  });

  it('generates exactly five uppercase random letters', () => {
    expect(randomProjectCodeSuffix()).toMatch(/^[A-Z]{5}$/);
  });

  it('uses a platform-and-month counter when creating a project', async () => {
    const projectCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'project-1', ...data, pm: { id: 'pm-1', displayName: '林知夏' } }));
    const counterUpsert = vi.fn(async () => ({ nextNumber: 2 }));
    const transaction = { projectCodeCounter: { upsert: counterUpsert }, project: { create: projectCreate } };
    const prisma = {
      projectManager: { findFirst: vi.fn(async () => ({ id: 'pm-1', displayName: '林知夏' })) },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new ProjectsService(prisma as never, { record: vi.fn() } as never);

    const result = await service.create({
      platform: '示例平台', platformAbbreviation: 'sl', publishedOn: '2026-07-15', name: '示例项目',
      nature: '公益', projectType: '培训', periodValue: '3', periodUnit: ProjectPeriodUnit.MONTH,
      approvedAmount: '100.00', executionCost: '50.00', pmUserId: 'pm-1',
    }, 'admin-1');

    expect(counterUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { platformAbbreviation_year_month: { platformAbbreviation: 'SL', year: 2026, month: 7 } },
    }));
    expect(result.projectCode).toMatch(/^SL260701[A-Z]{5}$/);
    expect(projectCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ platformAbbreviation: 'SL' }) }));
  });
});

describe('project overview filters', () => {
  it('builds exact dimensions and an inclusive published date range', () => {
    expect(buildProjectWhere({
      page: 1,
      pageSize: 20,
      platform: '公益平台',
      nature: '公益支持',
      projectType: '培训项目',
      publishedFrom: '2026-01-01',
      publishedTo: '2026-12-31',
    })).toEqual({
      platform: '公益平台',
      nature: '公益支持',
      projectType: '培训项目',
      publishedOn: {
        gte: new Date('2026-01-01'),
        lte: new Date('2026-12-31'),
      },
    });
  });

  it('rejects a reversed published date range', () => {
    expect(() => buildProjectWhere({
      page: 1,
      pageSize: 20,
      publishedFrom: '2026-08-10',
      publishedTo: '2026-08-09',
    })).toThrow('立项开始日期不能晚于结束日期');
  });
});

describe('PM project scope', () => {
  it('limits PM accounts to projects assigned to the bound PM', () => {
    expect(projectScopeFor({ role: 'PM', projectManagerId: 'pm-1' })).toEqual({ pmUserId: 'pm-1' });
    expect(projectScopeFor({ role: 'ADMIN', projectManagerId: 'pm-1' })).toEqual({});
  });
});

describe('project status and archive review workflow', () => {
  it('allows an active project to request completion or termination', () => {
    expect(() => validateStatusRequest(ProjectStatus.ACTIVE, null, ProjectStatus.CLOSED)).not.toThrow();
    expect(() => validateStatusRequest(ProjectStatus.ACTIVE, null, ProjectStatus.ABORTED)).not.toThrow();
  });

  it('rejects duplicate or invalid status requests', () => {
    expect(() => validateStatusRequest(ProjectStatus.ACTIVE, ProjectReviewState.PENDING, ProjectStatus.CLOSED)).toThrow('待复核');
    expect(() => validateStatusRequest(ProjectStatus.CLOSED, null, ProjectStatus.ABORTED)).toThrow('只有进行中');
    expect(() => validateStatusRequest(ProjectStatus.ACTIVE, null, ProjectStatus.ACTIVE)).toThrow('只能申请');
  });

  it('allows archive requests only after a project has ended', () => {
    expect(() => validateArchiveRequest(ProjectStatus.CLOSED, ArchiveStatus.UNARCHIVED, null)).not.toThrow();
    expect(() => validateArchiveRequest(ProjectStatus.ACTIVE, ArchiveStatus.UNARCHIVED, null)).toThrow('结项或中止后');
    expect(() => validateArchiveRequest(ProjectStatus.CLOSED, ArchiveStatus.ARCHIVED, null)).toThrow('已归档');
    expect(() => validateArchiveRequest(ProjectStatus.CLOSED, ArchiveStatus.UNARCHIVED, ProjectReviewState.PENDING)).toThrow('待复核');
  });
});
