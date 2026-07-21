import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard';

function context(role: string) {
  return {
    getHandler: () => context,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a configured role', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['ADMIN', 'FINANCE']) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context('FINANCE'))).toBe(true);
  });

  it('rejects a role outside the configured set', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['FINANCE']) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context('VIEWER'))).toThrow(ForbiddenException);
  });
});
