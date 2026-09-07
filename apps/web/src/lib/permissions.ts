import type { PermissionLevel, PermissionResource, User } from './types';

const ranks: Record<PermissionLevel, number> = { VIEW: 1, ENTRY: 2, EDIT: 3, REVIEW: 4 };

export function hasPermission(user: User | null | undefined, resource: PermissionResource, level: PermissionLevel) {
  if (!user) return false;
  if (user.role === 'SYSTEM_ADMIN') return true;
  const granted = user.permissions?.find((permission) => permission.resource === resource)?.level;
  return Boolean(granted && ranks[granted] >= ranks[level]);
}

const resourcePaths: [PermissionResource, string][] = [
  ['PROJECTS', '/projects'],
  ['CONTRACTS', '/contracts'],
  ['BANKING', '/banking'],
  ['INVOICES', '/invoices'],
  ['DONATION_RECEIPTS', '/invoices/donation'],
  ['SUPPORTERS', '/supporters'],
  ['EXECUTORS', '/executors'],
  ['EXPERTS', '/experts'],
  ['MEMBERS', '/members'],
];

export function defaultPath(user: User | null | undefined) {
  return resourcePaths.find(([resource]) => hasPermission(user, resource, 'VIEW'))?.[1] ?? '/no-access';
}
