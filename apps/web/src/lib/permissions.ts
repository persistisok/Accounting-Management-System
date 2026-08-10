import type { PermissionLevel, PermissionResource, User } from './types';

const ranks: Record<PermissionLevel, number> = { VIEW: 1, EDIT: 2, REVIEW: 3 };

export function hasPermission(user: User | null | undefined, resource: PermissionResource, level: PermissionLevel) {
  if (!user) return false;
  if (user.role === 'SYSTEM_ADMIN') return true;
  if (user.role === 'GUEST') return level === 'VIEW';
  if (user.role === 'PM' && ['PROJECTS', 'CONTRACTS', 'BANKING', 'INVOICES'].includes(resource)) {
    return Boolean(user.projectManagerId) && level !== 'REVIEW';
  }
  const granted = user.permissions?.find((permission) => permission.resource === resource)?.level;
  return Boolean(granted && ranks[granted] >= ranks[level]);
}

const resourcePaths: [PermissionResource, string][] = [
  ['PROJECTS', '/projects'],
  ['CONTRACTS', '/contracts'],
  ['BANKING', '/banking'],
  ['INVOICES', '/invoices'],
  ['SUPPORTERS', '/supporters'],
  ['EXECUTORS', '/executors'],
  ['EXPERTS', '/experts'],
  ['MEMBERS', '/members'],
];

export function defaultPath(user: User | null | undefined) {
  return resourcePaths.find(([resource]) => hasPermission(user, resource, 'VIEW'))?.[1] ?? '/no-access';
}
