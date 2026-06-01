import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { TenantRoleEnum } from '@shou/types/enums';
import { formatTraceLog } from '../common/trace-log';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionCacheService, TenantPermissionSnapshot } from './permission-cache.service';
import { DEFAULT_TENANT_ROLE_PERMISSIONS, assertTenantPermissionCodes } from './tenant-permission.definition';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // 读取 Tenant 用户权限快照 缓存缺失时按 tenantId 和 userId 从角色绑定聚合
  async getTenantPermissionSnapshot(tenantId: string, userId: string): Promise<TenantPermissionSnapshot> {
    try {
      const cachedSnapshot = await this.permissionCache.getTenantPermissionSnapshot(tenantId, userId);
      if (cachedSnapshot) {
        this.logSnapshot('permission.snapshot.hit', cachedSnapshot);
        return cachedSnapshot;
      }

      this.logger.log(formatTraceLog('permission.snapshot.miss', { tenantId, userId }));
      const snapshot = await this.buildTenantPermissionSnapshot(tenantId, userId);
      await this.permissionCache.setTenantPermissionSnapshot(snapshot);
      this.logSnapshot('permission.snapshot.rebuilt', snapshot);
      return snapshot;
    } catch (error) {
      const reason = getPermissionSnapshotFailureReason(error);
      const logMessage = formatTraceLog('permission.snapshot.failure', { tenantId, userId, reason });
      if (reason === 'unknown') {
        this.logger.error(logMessage, getErrorStack(error));
      } else {
        this.logger.warn(logMessage);
      }
      throw error;
    }
  }

  // 判断当前 Tenant 用户是否拥有接口要求的全部权限
  async hasTenantPermissions(tenantId: string, userId: string, requiredPermissions: readonly string[]): Promise<boolean> {
    return (await this.evaluateTenantPermissions(tenantId, userId, requiredPermissions)).allowed;
  }

  // 返回权限判断结果与当前权限数量，供 Guard 输出授权决策日志
  async evaluateTenantPermissions(
    tenantId: string,
    userId: string,
    requiredPermissions: readonly string[],
  ): Promise<{ allowed: boolean; permissionCount: number }> {
    const requiredCodes = assertTenantPermissionCodes(requiredPermissions);
    if (requiredCodes.length === 0) {
      return { allowed: true, permissionCount: 0 };
    }

    const snapshot = await this.getTenantPermissionSnapshot(tenantId, userId);
    const ownedPermissions = new Set(snapshot.permissions);
    return {
      allowed: requiredCodes.every((permission) => ownedPermissions.has(permission)),
      permissionCount: snapshot.permissions.length,
    };
  }

  // 读取 Redis 中当前权限版本 用于接口请求阶段识别旧 access token
  async getTenantPermissionVersion(tenantId: string, userId: string): Promise<number> {
    return this.permissionCache.getTenantPermissionVersion(tenantId, userId);
  }

  // 失效单个 Tenant 用户权限快照 并递增权限版本
  async invalidateTenantUserPermission(tenantId: string, userId: string): Promise<number> {
    return this.permissionCache.bumpTenantPermissionVersion(tenantId, userId);
  }

  // 批量失效 Tenant 用户权限 去重后按用户粒度递增版本
  async invalidateTenantUsersPermissions(tenantId: string, userIds: readonly string[]): Promise<void> {
    const uniqueUserIds = [...new Set(userIds.filter((userId) => userId.length > 0))];
    await Promise.all(uniqueUserIds.map((userId) => this.invalidateTenantUserPermission(tenantId, userId)));
  }

  // 按角色失效当前租户内仍有效的绑定用户权限 不跨租户读取绑定关系
  async invalidateTenantRoleUsersPermissions(tenantId: string, roleId: string): Promise<void> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        tenantId,
        roleId,
        user: {
          tenantId,
          deletedAt: null,
        },
      },
      select: {
        userId: true,
      },
    });

    await this.invalidateTenantUsersPermissions(
      tenantId,
      assignments.map((assignment) => assignment.userId),
    );
  }

  // 从数据库角色绑定聚合权限快照 所有查询显式收口在当前 tenantId 内
  private async buildTenantPermissionSnapshot(tenantId: string, userId: string): Promise<TenantPermissionSnapshot> {
    const assignment = await this.prisma.userRoleAssignment.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!assignment || assignment.role.deletedAt) {
      throw new ForbiddenException('当前用户未绑定可用角色');
    }

    const role = assignment.role;
    if (role.tenantId !== tenantId || assignment.tenantId !== tenantId || assignment.userId !== userId) {
      throw new ForbiddenException('当前用户角色绑定无效');
    }

    const permissionVersion = await this.permissionCache.getTenantPermissionVersion(tenantId, userId);
    const permissions = this.resolveRolePermissions(
      role.code,
      role.permissions.map((permission) => permission.permissionCode),
    );

    return {
      tenantId,
      userId,
      roleId: role.id,
      roleCode: role.code,
      roleName: role.name,
      permissions,
      permissionVersion,
      updatedAt: new Date().toISOString(),
    };
  }

  // 将角色权限码收敛为服务端闭集 脏数据直接拒绝避免进入授权链路
  private resolveRolePermissions(roleCode: string, permissionCodes: string[]) {
    if (roleCode === TenantRoleEnum.OWNER) {
      return [...DEFAULT_TENANT_ROLE_PERMISSIONS[TenantRoleEnum.OWNER]];
    }

    try {
      return assertTenantPermissionCodes(permissionCodes);
    } catch {
      throw new ForbiddenException('当前角色权限配置无效');
    }
  }

  // 输出权限快照命中或重建结果，只记录角色与权限数量不展开权限明细
  private logSnapshot(event: string, snapshot: TenantPermissionSnapshot): void {
    this.logger.log(
      formatTraceLog(event, {
        tenantId: snapshot.tenantId,
        userId: snapshot.userId,
        roleId: snapshot.roleId,
        roleCode: snapshot.roleCode,
        permissionVersion: snapshot.permissionVersion,
        permissionCount: snapshot.permissions.length,
      }),
    );
  }
}

function getPermissionSnapshotFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === '当前用户未绑定可用角色') {
    return 'role_binding_missing';
  }

  if (message === '当前用户角色绑定无效') {
    return 'role_binding_invalid';
  }

  if (message === '当前角色权限配置无效') {
    return 'role_permission_invalid';
  }

  return 'unknown';
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
