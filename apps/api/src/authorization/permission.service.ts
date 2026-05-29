import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantRoleEnum } from '@shou/types/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionCacheService, TenantPermissionSnapshot } from './permission-cache.service';
import { DEFAULT_TENANT_ROLE_PERMISSIONS, assertTenantPermissionCodes } from './tenant-permission.definition';

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // 读取 Tenant 用户权限快照 缓存缺失时按 tenantId 和 userId 从角色绑定聚合
  async getTenantPermissionSnapshot(tenantId: string, userId: string): Promise<TenantPermissionSnapshot> {
    const cachedSnapshot = await this.permissionCache.getTenantPermissionSnapshot(tenantId, userId);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    const snapshot = await this.buildTenantPermissionSnapshot(tenantId, userId);
    await this.permissionCache.setTenantPermissionSnapshot(snapshot);
    return snapshot;
  }

  // 判断当前 Tenant 用户是否拥有接口要求的全部权限
  async hasTenantPermissions(tenantId: string, userId: string, requiredPermissions: readonly string[]): Promise<boolean> {
    const requiredCodes = assertTenantPermissionCodes(requiredPermissions);
    if (requiredCodes.length === 0) {
      return true;
    }

    const snapshot = await this.getTenantPermissionSnapshot(tenantId, userId);
    const ownedPermissions = new Set(snapshot.permissions);
    return requiredCodes.every((permission) => ownedPermissions.has(permission));
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
}
