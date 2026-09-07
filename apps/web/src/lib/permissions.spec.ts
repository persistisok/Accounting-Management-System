import { describe, expect, it } from 'vitest';
import type { User } from './types';
import { defaultPath, hasPermission } from './permissions';

function user(overrides: Partial<User>): User {
  return {
    id: 'user-1', username: 'user', displayName: '用户', role: 'ADMIN', projectManagerId: null,
    status: 'ACTIVE', createdAt: '', updatedAt: '', permissions: [], projectIds: [], ...overrides,
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

  it('uses configured entry and view permissions for PM accounts', () => {
    const pm = user({ role: 'PM', projectManagerId: 'pm-1' });
    expect(hasPermission(pm, 'PROJECTS', 'VIEW')).toBe(false);
    const entryPm = { ...pm, permissions: [{ resource: 'PROJECTS', level: 'ENTRY' }] } as User;
    expect(hasPermission(entryPm, 'PROJECTS', 'VIEW')).toBe(true);
    expect(hasPermission(entryPm, 'PROJECTS', 'ENTRY')).toBe(true);
    expect(hasPermission(entryPm, 'PROJECTS', 'EDIT')).toBe(false);
    expect(hasPermission(pm, 'EXPERTS', 'VIEW')).toBe(false);
    expect(hasPermission({ ...pm, permissions: [{ resource: 'EXPERTS', level: 'VIEW' }] }, 'EXPERTS', 'VIEW')).toBe(true);
    expect(defaultPath(entryPm)).toBe('/projects');
  });
});
