import { SetMetadata } from '@nestjs/common';

export type AppRole = 'SYSTEM_ADMIN' | 'ADMIN' | 'PM' | 'GUEST';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
