import { Injectable } from '@nestjs/common';
import type { TenantPermissionCode } from '@shou/types/enums';
import { RedisService } from '../redis/redis.service';
import { assertTenantPermissionCodes, isTenantPermissionCode } from './tenant-permission.definition';

export const TENANT_PERMISSION_SNAPSHOT_TTL_SECONDS = 900;
const INITIAL_PERMISSION_VERSION = 1;

export interface TenantPermissionSnapshot {
  tenantId: string;
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: TenantPermissionCode[];
  permissionVersion: number;
  updatedAt: string;
}

@Injectable()
export class PermissionCacheService {
  constructor(private readonly redis: RedisService) {}

  // 读取当前租户用户的权限快照 缓存缺失或缓存结构异常时返回 null
  async getTenantPermissionSnapshot(tenantId: string, userId: string): Promise<TenantPermissionSnapshot | null> {
    const key = this.getTenantPermissionSnapshotKey(tenantId, userId);
    const rawSnapshot = await this.redis.getJson<unknown>(key);
    if (!rawSnapshot) {
      return null;
    }

    const snapshot = this.parseTenantPermissionSnapshot(rawSnapshot, tenantId, userId);
    if (!snapshot) {
      await this.redis.delete(key);
      return null;
    }

    return snapshot;
  }

  // 写入当前租户用户的权限快照 并刷新缓存 TTL
  async setTenantPermissionSnapshot(snapshot: TenantPermissionSnapshot, ttlSeconds: number = TENANT_PERMISSION_SNAPSHOT_TTL_SECONDS): Promise<void> {
    const normalizedSnapshot = this.normalizeTenantPermissionSnapshot(snapshot);
    await this.redis.setJson(this.getTenantPermissionSnapshotKey(snapshot.tenantId, snapshot.userId), normalizedSnapshot, ttlSeconds);
  }

  // 清理当前租户用户的权限快照 用于角色或权限变更后强制重建
  async clearTenantPermissionSnapshot(tenantId: string, userId: string): Promise<void> {
    await this.redis.delete(this.getTenantPermissionSnapshotKey(tenantId, userId));
  }

  // 读取当前租户用户的权限版本号 缺失时初始化为 1
  async getTenantPermissionVersion(tenantId: string, userId: string): Promise<number> {
    const key = this.getTenantPermissionVersionKey(tenantId, userId);
    const current = await this.redis.getClient().get(key);
    if (current) {
      const parsed = Number.parseInt(current, 10);
      return Number.isNaN(parsed) ? INITIAL_PERMISSION_VERSION : parsed;
    }

    await this.redis.getClient().set(key, String(INITIAL_PERMISSION_VERSION));
    return INITIAL_PERMISSION_VERSION;
  }

  // 递增当前租户用户的权限版本号 并同步清理权限快照
  async bumpTenantPermissionVersion(tenantId: string, userId: string): Promise<number> {
    const nextVersion = await this.redis.getClient().incr(this.getTenantPermissionVersionKey(tenantId, userId));
    await this.clearTenantPermissionSnapshot(tenantId, userId);
    return nextVersion;
  }

  // 将外部传入的权限快照收敛为可缓存结构
  private normalizeTenantPermissionSnapshot(snapshot: TenantPermissionSnapshot): TenantPermissionSnapshot {
    return {
      ...snapshot,
      permissions: assertTenantPermissionCodes(snapshot.permissions),
      permissionVersion: this.normalizePermissionVersion(snapshot.permissionVersion),
      updatedAt: snapshot.updatedAt || new Date().toISOString(),
    };
  }

  // 将 Redis 读出的未知 JSON 还原为权限快照 并校验租户边界与权限闭集
  private parseTenantPermissionSnapshot(value: unknown, tenantId: string, userId: string): TenantPermissionSnapshot | null {
    if (!this.isRecord(value)) {
      return null;
    }

    if (value.tenantId !== tenantId || value.userId !== userId) {
      return null;
    }

    if (
      typeof value.roleId !== 'string' ||
      typeof value.roleCode !== 'string' ||
      typeof value.roleName !== 'string' ||
      typeof value.updatedAt !== 'string' ||
      !Array.isArray(value.permissions)
    ) {
      return null;
    }

    const permissions = value.permissions;
    if (
      !permissions.every((permission): permission is TenantPermissionCode => typeof permission === 'string' && isTenantPermissionCode(permission))
    ) {
      return null;
    }

    return {
      tenantId,
      userId,
      roleId: value.roleId,
      roleCode: value.roleCode,
      roleName: value.roleName,
      permissions: [...new Set(permissions)],
      permissionVersion: this.normalizePermissionVersion(value.permissionVersion),
      updatedAt: value.updatedAt,
    };
  }

  // 将异常版本值收敛到初始版本 避免 Redis 脏值扩散到授权链路
  private normalizePermissionVersion(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < INITIAL_PERMISSION_VERSION) {
      return INITIAL_PERMISSION_VERSION;
    }

    return value;
  }

  // 判断未知 JSON 是否可按对象字段读取
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  // 生成当前租户用户权限快照缓存 key
  private getTenantPermissionSnapshotKey(tenantId: string, userId: string): string {
    return `tenant-permissions:${tenantId}:${userId}`;
  }

  // 生成当前租户用户权限版本号 key
  private getTenantPermissionVersionKey(tenantId: string, userId: string): string {
    return `tenant-permission-version:${tenantId}:${userId}`;
  }
}
