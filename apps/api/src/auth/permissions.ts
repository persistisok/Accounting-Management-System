import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { PermissionLevel, PermissionResource } from '@prisma/client';
import type { AuthUser } from '../common/current-user.decorator';

export const PERMISSION_KEY = 'required-permission';

export type PermissionResourceValue = `${PermissionResource}`;
export type PermissionLevelValue = `${PermissionLevel}`;

export interface RequiredPermission {
  resource: PermissionResourceValue;
  level: PermissionLevelValue;
}

export const RequirePermission = (resource: PermissionResourceValue, level: PermissionLevelValue) =>
  SetMetadata(PERMISSION_KEY, { resource, level } satisfies RequiredPermission);

const permissionRank: Record<PermissionLevelValue, number> = {
  VIEW: 1,
  ENTRY: 2,
  EDIT: 3,
  REVIEW: 4,
};

export function hasPermission(user: AuthUser | undefined, resource: PermissionResourceValue, level: PermissionLevelValue) {
  if (!user) return false;
  if (user.role === 'SYSTEM_ADMIN') return true;
  const granted = user.permissions.find((permission) => permission.resource === resource)?.level;
  return Boolean(granted && permissionRank[granted] >= permissionRank[level]);
}

export function assertPermission(user: AuthUser, resource: PermissionResourceValue, level: PermissionLevelValue) {
  if (!hasPermission(user, resource, level)) throw new ForbiddenException('当前账号没有该模块的操作权限');
}
