import { describe, expect, it } from 'vitest';
import type { User } from './types';
import { defaultPath, hasPermission } from './permissions';

function user(overrides: Partial<User>): User {
  return {
    id: 'user-1', username: 'user', displayName: '用户', role: 'ADMIN', projectManagerId: null,
    status: 'ACTIVE', createdAt: '', updatedAt: '', permissions: [], ...overrides,
  };
}

describe('frontend account permissions', () => {
  it('uses permission level hierarchy for ordinary administrators', () => {
    const admin = user({ permissions: [{ resource: 'EXPERTS', level: 'REVIEW' }] });
    expect(hasPermission(admin, 'EXPERTS', 'VIEW')).toBe(true);
    expect(hasPermission(admin, 'EXPERTS', 'EDIT')).toBe(true);
    expect(hasPermission(admin, 'EXPERTS', 'REVIEW')).toBe(true);
    expect(hasPermission(admin, 'PROJECTS', 'VIEW')).toBe(false);
  });

  it('gives PM accounts their own ledgers and configurable library permissions', () => {
    const pm = user({ role: 'PM', projectManagerId: 'pm-1' });
    expect(hasPermission(pm, 'PROJECTS', 'VIEW')).toBe(true);
    expect(hasPermission(pm, 'PROJECTS', 'EDIT')).toBe(true);
    expect(hasPermission(pm, 'CONTRACTS', 'VIEW')).toBe(true);
    expect(hasPermission(pm, 'BANKING', 'EDIT')).toBe(true);
    expect(hasPermission(pm, 'EXPERTS', 'VIEW')).toBe(false);
    expect(hasPermission({ ...pm, permissions: [{ resource: 'EXPERTS', level: 'VIEW' }] }, 'EXPERTS', 'VIEW')).toBe(true);
    expect(defaultPath(pm)).toBe('/projects');
  });
});
