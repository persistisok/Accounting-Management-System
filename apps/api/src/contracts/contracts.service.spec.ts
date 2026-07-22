import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractsService, formatInternalContractNo } from './contracts.service';

describe('ContractsService agreements', () => {
  const audit = { record: vi.fn() };
  const prisma = {
    contract: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organizationRole: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: ContractsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContractsService(prisma as never, audit as never);
    prisma.organizationRole.findFirst.mockResolvedValue({ id: 'role-id' });
  });

  it('formats a unique internal number without exposing it as input', () => {
    expect(formatInternalContractNo('123e4567-e89b-12d3-a456-426614174000')).toBe('CTR-123E4567-E89B-12D3-A456-426614174000');
  });

  it('always creates a signed receivable support agreement', async () => {
    prisma.contract.create.mockResolvedValue({
      id: 'contract-id', contractNo: 'CTR-ID', amount: { toString: () => '100.00' }, status: 'SIGNED',
    });

    await service.create({
      projectId: 'project-id', contractType: 'SUPPORT', contractEntity: '本方主体', counterpartyId: 'supporter-id', amount: '100.00', signedOn: '2026-07-22',
    }, 'admin-id');

    expect(prisma.organizationRole.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
      organizationId: 'supporter-id', roleType: 'SUPPORTER', reviewStatus: 'APPROVED',
    }) });
    expect(prisma.contract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      contractDirection: 'RECEIVABLE', contractType: 'SUPPORT', status: 'SIGNED', contractNo: expect.stringMatching(/^CTR-/),
    }) }));
  });

  it('creates a payable execution agreement for any active executor', async () => {
    prisma.contract.create.mockResolvedValue({
      id: 'contract-id', contractNo: 'CTR-ID', amount: { toString: () => '200.00' }, status: 'SIGNED',
    });

    await service.create({
      projectId: 'project-id', contractType: 'EXECUTION', contractEntity: '本方主体', counterpartyId: 'executor-id', amount: '200.00', signedOn: '2026-07-22',
    }, 'admin-id');

    expect(prisma.organizationRole.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
      organizationId: 'executor-id', roleType: 'EXECUTOR', reviewStatus: 'APPROVED',
    }) });
    expect(prisma.contract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      contractDirection: 'PAYABLE', contractType: 'EXECUTION', status: 'SIGNED',
    }) }));
  });

  it('lists both support and execution agreements', async () => {
    prisma.contract.findMany.mockReturnValue('items-query');
    prisma.contract.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list({ q: '医院', page: 1, pageSize: 20 });

    expect(prisma.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([
        { contractEntity: { contains: '医院', mode: 'insensitive' } },
      ]) }),
    }));
    expect(prisma.contract.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('contractType');
  });

  it('allows an execution agreement to be edited', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'contract-id', status: 'SIGNED', contractType: 'EXECUTION', counterpartyId: 'executor-id',
      projectId: 'project-id', amount: { toString: () => '200.00' }, contractNo: 'CTR-ID',
    });
    prisma.contract.update.mockResolvedValue({
      id: 'contract-id', contractNo: 'CTR-ID', amount: { toString: () => '220.00' }, status: 'SIGNED',
    });

    await service.update('contract-id', { amount: '220.00' }, 'admin-id');

    expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: '220.00' }) }));
  });
});
