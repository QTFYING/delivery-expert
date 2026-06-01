import { CanActivate, ExecutionContext, ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoleEnum, type TenantPermissionCode, type UserRole } from '@shou/types/enums';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import { formatTraceLog } from '../common/trace-log';
import { PermissionService } from './permission.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  // 校验 @Permissions 声明的 Tenant 功能权限 未声明时放行以兼容旧 @Roles
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<TenantPermissionCode[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user) {
      this.logPermissionDenied('missing_user', requiredPermissions);
      throw new ForbiddenException('当前接口需要登录后访问');
    }

    if (user.side === 'platform') {
      const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
      if (requiredRoles?.includes(UserRoleEnum.OS_SUPER_ADMIN)) {
        this.logger.log(
          formatTraceLog('permission.check.allow', {
            userId: user.userId,
            tenantId: user.tenantId ?? 'null',
            side: user.side,
            role: user.role,
            requiredPermissions,
            reason: 'platform_super_admin',
          }),
        );
        return true;
      }
    }

    if (user.side !== 'tenant' || !user.tenantId) {
      this.logPermissionDenied('tenant_required', requiredPermissions, user);
      throw new ForbiddenException('当前接口仅允许租户用户访问');
    }

    await this.assertPermissionVersionCurrent(user);

    const evaluation = await this.permissionService.evaluateTenantPermissions(user.tenantId, user.userId, requiredPermissions);
    if (!evaluation.allowed) {
      this.logPermissionDenied('missing_permission', requiredPermissions, user, evaluation.permissionCount);
      throw new ForbiddenException('您没有权限执行此操作');
    }

    this.logger.log(
      formatTraceLog('permission.check.allow', {
        tenantId: user.tenantId,
        userId: user.userId,
        side: user.side,
        role: user.role,
        requiredPermissions,
        permissionCount: evaluation.permissionCount,
      }),
    );

    return true;
  }

  // 对比 token 与 Redis 中的权限版本 旧 token 返回业务码 4006 提醒前端刷新 /auth/me
  private async assertPermissionVersionCurrent(user: JwtPayload): Promise<void> {
    if (!user.tenantId) {
      throw new ForbiddenException('当前接口仅允许租户用户访问');
    }

    const currentPermissionVersion = await this.permissionService.getTenantPermissionVersion(user.tenantId, user.userId);
    if (user.permissionVersion < currentPermissionVersion) {
      this.logger.warn(
        formatTraceLog('permission.version.stale', {
          tenantId: user.tenantId,
          userId: user.userId,
          tokenPermissionVersion: user.permissionVersion,
          currentPermissionVersion,
        }),
      );
      throw new BusinessException(4006, '权限已变更，请刷新当前用户信息', HttpStatus.FORBIDDEN);
    }

    this.logger.log(
      formatTraceLog('permission.version.ok', {
        tenantId: user.tenantId,
        userId: user.userId,
        tokenPermissionVersion: user.permissionVersion,
        currentPermissionVersion,
      }),
    );
  }

  // 输出 Tenant 权限拒绝原因，记录所需权限和当前用户上下文
  private logPermissionDenied(
    reason: string,
    requiredPermissions: readonly TenantPermissionCode[],
    user?: JwtPayload,
    permissionCount?: number,
  ): void {
    this.logger.warn(
      formatTraceLog('permission.check.denied', {
        tenantId: user?.tenantId ?? 'null',
        userId: user?.userId,
        side: user?.side,
        role: user?.role,
        requiredPermissions,
        permissionCount,
        reason,
      }),
    );
  }
}
