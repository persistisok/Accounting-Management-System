import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PermissionLevel, PermissionResource, UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  projectManagerId: string | null;
  projectIds: string[];
  permissions: { resource: PermissionResource; level: PermissionLevel }[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
