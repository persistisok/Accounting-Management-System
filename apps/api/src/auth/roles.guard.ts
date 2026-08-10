import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../common/current-user.decorator';
import { AppRole, ROLES_KEY } from './roles.decorator';
import { hasPermission, PERMISSION_KEY, type RequiredPermission } from './permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (roles?.length && (!user || !roles.includes(user.role as AppRole))) {
      throw new ForbiddenException('当前角色无权执行此操作');
    }
    const permission = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (permission && !hasPermission(user, permission.resource, permission.level)) {
      throw new ForbiddenException('当前账号没有该模块的操作权限');
    }
    return true;
  }
}
