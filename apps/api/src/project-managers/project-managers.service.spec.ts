import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectManagersService } from './project-managers.service';

vi.mock('bcryptjs', () => ({ hash: vi.fn(async (value: string) => `hashed:${value}`) }));

const pm = {
  id: '00000000-0000-0000-0000-000000000010',
  username: 'pm.test',
  passwordHash: 'old-hash',
  displayName: '测试经理',
  department: '项目部',
  role: 'PM',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProjectManagersService', () => {
  const audit = { record: vi.fn() };
  const transaction = {
    user: { update: vi.fn() },
    project: { updateMany: vi.fn() },
  };
  const prisma = {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: ProjectManagersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjectManagersService(prisma as never, audit as never);
  });

  it('creates an active PM account with a hashed password', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ ...pm, _count: { projects: 0 } });

    await service.create({ username: ' pm.test ', password: 'Password123!', displayName: ' 测试经理 ', department: ' 项目部 ' }, 'admin-id');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      username: 'pm.test', passwordHash: 'hashed:Password123!', displayName: '测试经理', department: '项目部', role: 'PM', status: 'ACTIVE',
    }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', objectType: 'PROJECT_MANAGER' }));
  });

  it('synchronizes a changed PM name to linked projects', async () => {
    prisma.user.findFirst.mockResolvedValue(pm);
    transaction.user.update.mockResolvedValue({ ...pm, displayName: '新姓名', _count: { projects: 2 } });
    transaction.project.updateMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation((callback: (client: typeof transaction) => unknown) => callback(transaction));

    await service.update(pm.id, { displayName: '新姓名' }, 'admin-id');

    expect(transaction.project.updateMany).toHaveBeenCalledWith({ where: { pmUserId: pm.id }, data: { pmName: '新姓名' } });
  });

  it('soft deletes a PM so historical relations remain intact', async () => {
    prisma.user.findFirst.mockResolvedValue(pm);
    prisma.user.update.mockResolvedValue({ ...pm, status: 'INACTIVE', _count: { projects: 2 } });

    const result = await service.remove(pm.id, 'admin-id');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: pm.id }, data: { status: 'INACTIVE' } }));
    expect(result.status).toBe('INACTIVE');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }));
  });
});
