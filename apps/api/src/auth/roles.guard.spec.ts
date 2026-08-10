import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEY } from './permissions';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function context(role: string, permissions: { resource: string; level: string }[] = [], projectManagerId: string | null = null) {
  return {
    getHandler: () => context,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user: { role, permissions, projectManagerId } }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a configured role', () => {
    const reflector = { getAllAndOverride: vi.fn((key: string) => key === ROLES_KEY ? ['SYSTEM_ADMIN', 'ADMIN'] : undefined) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context('SYSTEM_ADMIN'))).toBe(true);
    expect(new RolesGuard(reflector).canActivate(context('ADMIN'))).toBe(true);
  });

  it('rejects a role outside the configured set', () => {
    const reflector = { getAllAndOverride: vi.fn((key: string) => key === ROLES_KEY ? ['ADMIN'] : undefined) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context('GUEST'))).toThrow(ForbiddenException);
  });

  it('enforces configured module permission levels for ordinary administrators', () => {
    const reflector = { getAllAndOverride: vi.fn((key: string) => key === PERMISSION_KEY ? { resource: 'EXPERTS', level: 'REVIEW' } : undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context('ADMIN', [{ resource: 'EXPERTS', level: 'EDIT' }]))).toThrow(ForbiddenException);
    expect(guard.canActivate(context('ADMIN', [{ resource: 'EXPERTS', level: 'REVIEW' }]))).toBe(true);
    expect(guard.canActivate(context('SYSTEM_ADMIN'))).toBe(true);
  });

  it('enforces the configured permissions for PM accounts', () => {
    const reflector = { getAllAndOverride: vi.fn((key: string) => key === PERMISSION_KEY ? { resource: 'EXPERTS', level: 'VIEW' } : undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context('PM', [{ resource: 'EXPERTS', level: 'VIEW' }], 'pm-id'))).toBe(true);
    expect(() => guard.canActivate(context('PM', [], 'pm-id'))).toThrow(ForbiddenException);
  });
});
