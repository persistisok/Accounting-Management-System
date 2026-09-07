import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('filters and paginates operation logs with actor information', async () => {
    const prisma = {
      auditLog: { findMany: vi.fn(), count: vi.fn() },
      project: { findMany: vi.fn(async () => [{ id: 'project-id', projectCode: 'SL260901ABCDE', name: '测试项目' }]) },
      $transaction: vi.fn(async () => [[{ id: 'log-id', objectType: 'PROJECT', objectId: 'project-id', actor: { displayName: '管理员' } }], 1]),
    };
    const service = new AuditService(prisma as never);
    await expect(service.list({ page: 2, pageSize: 20, actorUserId: '00000000-0000-4000-8000-000000000001', action: 'UPDATE', occurredFrom: '2026-09-01', occurredTo: '2026-09-07' })).resolves.toMatchObject({ total: 1, items: [{ objectDisplayName: 'SL260901ABCDE · 测试项目' }] });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, include: { actor: expect.anything() } }));
  });

  it('rejects a reversed operation date range', async () => {
    const service = new AuditService({} as never);
    await expect(service.list({ page: 1, pageSize: 20, occurredFrom: '2026-09-08', occurredTo: '2026-09-07' })).rejects.toThrow('不能早于起始日期');
  });
});
