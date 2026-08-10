import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service';

vi.mock('bcryptjs', () => ({ hash: vi.fn(async (value: string) => `hashed:${value}`) }));

const account = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'visitor',
  passwordHash: 'hash',
  displayName: '访客用户',
  role: 'GUEST',
  projectManagerId: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AccountsService', () => {
  const audit = { record: vi.fn() };
  const prisma = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    projectManager: { findFirst: vi.fn() },
  };
  let service: AccountsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountsService(prisma as never, audit as never);
    prisma.user.findFirst.mockResolvedValue(null);
  });

  it('creates a guest with a name and no PM binding', async () => {
    prisma.user.create.mockResolvedValue({ ...account, projectManager: null });

    await service.create({
      username: ' visitor ', password: 'Password123!', displayName: ' 访客用户 ', role: 'GUEST', projectManagerId: '00000000-0000-0000-0000-000000000099',
    }, 'admin-id');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      username: 'visitor', displayName: '访客用户', role: 'GUEST', projectManagerId: null, passwordHash: 'hashed:Password123!',
    }) }));
  });

  it('only allows a PM account to bind an active unbound PM', async () => {
    prisma.projectManager.findFirst.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000099' });
    prisma.user.create.mockResolvedValue({ ...account, role: 'PM', projectManagerId: '00000000-0000-0000-0000-000000000099' });

    await service.create({
      username: 'manager', password: 'Password123!', displayName: '项目经理', role: 'PM', projectManagerId: '00000000-0000-0000-0000-000000000099',
    }, 'admin-id');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      role: 'PM', projectManagerId: '00000000-0000-0000-0000-000000000099',
    }) }));
  });

  it('ignores a PM binding supplied for a regular administrator', async () => {
    prisma.user.create.mockResolvedValue({ ...account, role: 'ADMIN', projectManager: null });

    await service.create({
      username: 'manager', password: 'Password123!', displayName: '管理员', role: 'ADMIN', projectManagerId: '00000000-0000-0000-0000-000000000099',
    }, 'admin-id');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      role: 'ADMIN', projectManagerId: null,
    }) }));
  });

  it('allows a system administrator to create another system administrator', async () => {
    prisma.user.create.mockResolvedValue({ ...account, username: 'root2', role: 'SYSTEM_ADMIN', projectManager: null });

    await service.create({
      username: 'root2', password: 'Password123!', displayName: '第二管理员', role: 'SYSTEM_ADMIN', projectManagerId: null,
    }, 'system-admin-id');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      username: 'root2', role: 'SYSTEM_ADMIN', projectManagerId: null,
    }) }));
  });

  it('rejects binding a PM already used by another account', async () => {
    prisma.projectManager.findFirst.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000099' });
    prisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other-account' });

    await expect(service.create({
      username: 'manager', password: 'Password123!', displayName: '项目经理', role: 'PM', projectManagerId: '00000000-0000-0000-0000-000000000099',
    }, 'admin-id')).rejects.toThrow(ConflictException);
  });

  it('does not allow the current system administrator to deactivate or demote itself', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...account, role: 'SYSTEM_ADMIN' });

    await expect(service.update(account.id, { status: 'INACTIVE' }, account.id)).rejects.toThrow(BadRequestException);
    await expect(service.update(account.id, { role: 'ADMIN' }, account.id)).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('releases the PM binding when an account is deactivated', async () => {
    const pmId = '00000000-0000-0000-0000-000000000099';
    prisma.user.findUnique.mockResolvedValue({ ...account, role: 'PM', projectManagerId: pmId, permissions: [] });
    prisma.projectManager.findFirst.mockResolvedValue({ id: pmId });
    prisma.user.update.mockResolvedValue({ ...account, role: 'PM', status: 'INACTIVE', projectManagerId: null, projectManager: null });

    await service.update(account.id, { status: 'INACTIVE' }, 'system-admin-id');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'INACTIVE', projectManager: { disconnect: true },
    }) }));
  });

  it('releases the PM binding through the quick deactivate action', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...account, role: 'PM', projectManagerId: '00000000-0000-0000-0000-000000000099', permissions: [] });
    prisma.user.update.mockResolvedValue({ ...account, status: 'INACTIVE', projectManagerId: null, projectManager: null });

    await service.remove(account.id, 'system-admin-id');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      status: 'INACTIVE', projectManager: { disconnect: true },
    } }));
  });
});
