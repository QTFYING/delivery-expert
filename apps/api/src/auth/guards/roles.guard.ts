import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@shou/types/enums';
import { PERMISSIONS_KEY } from '../../authorization/permissions.decorator';
import { formatTraceLog } from '../../common/trace-log';
import { JwtPayload } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  // 校验平台侧角色要求，Tenant 权限接口交由 PermissionsGuard 做功能授权
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const requiredPermissions = this.reflector.getAllAndOverride(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (user?.side === 'tenant' && requiredPermissions?.length) {
      this.logger.log(
        formatTraceLog('role.check.skip', {
          userId: user.userId,
          tenantId: user.tenantId,
          side: user.side,
          role: user.role,
          requiredRoles,
          reason: 'tenant_permissions_guard',
        }),
      );
      return true;
    }

    if (!user || !requiredRoles.includes(user.role)) {
      this.logger.warn(
        formatTraceLog('role.check.denied', {
          userId: user?.userId,
          tenantId: user?.tenantId ?? 'null',
          side: user?.side,
          role: user?.role,
          requiredRoles,
          reason: user ? 'role_mismatch' : 'missing_user',
        }),
      );
      throw new ForbiddenException('您没有权限执行此操作 (Insufficient roles)');
    }

    this.logger.log(
      formatTraceLog('role.check.allow', {
        userId: user.userId,
        tenantId: user.tenantId ?? 'null',
        side: user.side,
        role: user.role,
        requiredRoles,
      }),
    );

    return true;
  }
}
