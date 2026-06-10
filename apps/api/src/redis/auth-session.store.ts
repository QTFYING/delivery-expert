import { Injectable } from '@nestjs/common';
import type { UserRole } from '@shou/types/enums';
import * as crypto from 'crypto';
import dayjs from 'dayjs';
import { RedisService } from './redis.service';

type SessionStatus = 'active' | 'revoked';

export interface AuthSessionRecord {
  sessionId: string;
  userId: string;
  account: string;
  role: UserRole;
  tenantId: string | null;
  status: SessionStatus;
  refreshTokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export type AuthSessionSnapshot = Pick<AuthSessionRecord, 'sessionId' | 'userId' | 'account' | 'role' | 'tenantId'>;

@Injectable()
export class AuthSessionStore {
  constructor(private readonly redis: RedisService) {}

  // 读取用户 token 版本号 若首次访问则初始化为 1
  async getUserTokenVersion(userId: string): Promise<number> {
    const key = this.getUserTokenVersionKey(userId);
    const current = await this.redis.getClient().get(key);
    if (current) {
      const parsed = Number.parseInt(current, 10);
      return Number.isNaN(parsed) ? 1 : parsed;
    }

    await this.redis.getClient().set(key, '1');
    return 1;
  }

  // 递增用户 token 版本号 让旧 access token 立即失效
  async bumpUserTokenVersion(userId: string): Promise<number> {
    return this.redis.getClient().incr(this.getUserTokenVersionKey(userId));
  }

  // 创建新的认证会话 并同步写入 session hash refresh 索引和用户会话索引
  async createAuthSession(
    snapshot: AuthSessionSnapshot,
    refreshToken: string,
    accessTtlSeconds: number,
    refreshTtlSeconds: number,
  ): Promise<AuthSessionRecord> {
    const now = dayjs().valueOf();
    const refreshTokenHash = this.hashToken(refreshToken);
    const session: AuthSessionRecord = {
      ...snapshot,
      status: 'active',
      refreshTokenHash,
      createdAt: now,
      lastSeenAt: now,
      accessExpiresAt: now + accessTtlSeconds * 1000,
      refreshExpiresAt: now + refreshTtlSeconds * 1000,
    };

    await this.persistAuthSessionRecord(session, refreshTtlSeconds);
    return session;
  }

  // 按 sessionId 读取完整会话记录
  async getAuthSession(sessionId: string): Promise<AuthSessionRecord | null> {
    const result = await this.redis.getClient().hGetAll(this.getSessionKey(sessionId));
    if (Object.keys(result).length === 0) {
      return null;
    }

    return this.deserializeSession(result);
  }

  // 通过 refresh token 反查会话 并校验 refresh token hash 是否仍匹配
  async getAuthSessionByRefreshToken(refreshToken: string): Promise<AuthSessionRecord | null> {
    const refreshTokenHash = this.hashToken(refreshToken);
    const sessionId = await this.redis.getClient().get(this.getRefreshTokenKeyByHash(refreshTokenHash));
    if (!sessionId) {
      return null;
    }

    const session = await this.getAuthSession(sessionId);
    if (!session || session.refreshTokenHash !== refreshTokenHash) {
      return null;
    }

    return session;
  }

  // 刷新已有会话 保留 sessionId 与 createdAt 同时替换 refresh token 索引
  async refreshAuthSession(
    sessionId: string,
    snapshot: Omit<AuthSessionSnapshot, 'sessionId'>,
    nextRefreshToken: string,
    accessTtlSeconds: number,
    refreshTtlSeconds: number,
  ): Promise<AuthSessionRecord | null> {
    const existing = await this.getAuthSession(sessionId);
    if (!existing) {
      return null;
    }

    const now = dayjs().valueOf();
    const nextRefreshTokenHash = this.hashToken(nextRefreshToken);
    const nextSession: AuthSessionRecord = {
      ...existing,
      ...snapshot,
      status: 'active',
      refreshTokenHash: nextRefreshTokenHash,
      lastSeenAt: now,
      accessExpiresAt: now + accessTtlSeconds * 1000,
      refreshExpiresAt: now + refreshTtlSeconds * 1000,
    };

    await this.persistAuthSessionRecord(nextSession, refreshTtlSeconds, existing.refreshTokenHash);
    return nextSession;
  }

  // 刷新最近访问时间 维持用户会话集合中的活跃度排序
  async touchAuthSession(sessionId: string, userId: string): Promise<void> {
    const now = dayjs().valueOf();
    await this.redis
      .getClient()
      .multi()
      .hSet(this.getSessionKey(sessionId), { lastSeenAt: String(now) })
      .zAdd(this.getUserSessionsKey(userId), { score: now, value: sessionId })
      .exec();
  }

  // 注销会话 并删除 refresh token 索引及用户会话集合中的引用
  async revokeAuthSession(sessionId: string): Promise<void> {
    const session = await this.getAuthSession(sessionId);
    if (!session) {
      return;
    }

    await this.redis
      .getClient()
      .multi()
      .del(this.getSessionKey(sessionId))
      .del(this.getRefreshTokenKeyByHash(session.refreshTokenHash))
      .zRem(this.getUserSessionsKey(session.userId), sessionId)
      .exec();
  }

  // 注销用户全部会话 并删除 refresh token 索引
  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.redis.getClient().zRange(this.getUserSessionsKey(userId), 0, -1);
    const sessions = await Promise.all(sessionIds.map((sessionId) => this.getAuthSession(sessionId)));
    const multi = this.redis.getClient().multi();

    for (const session of sessions) {
      if (!session) {
        continue;
      }

      multi.del(this.getSessionKey(session.sessionId));
      multi.del(this.getRefreshTokenKeyByHash(session.refreshTokenHash));
    }

    multi.del(this.getUserSessionsKey(userId));
    await multi.exec();
  }

  // 持久化整份会话记录 并在刷新场景下顺手清理旧的 refresh token 索引
  private async persistAuthSessionRecord(session: AuthSessionRecord, refreshTtlSeconds: number, previousRefreshTokenHash?: string): Promise<void> {
    const sessionKey = this.getSessionKey(session.sessionId);
    const userSessionsKey = this.getUserSessionsKey(session.userId);
    const refreshKey = this.getRefreshTokenKeyByHash(session.refreshTokenHash);
    const multi = this.redis.getClient().multi();

    if (previousRefreshTokenHash) {
      multi.del(this.getRefreshTokenKeyByHash(previousRefreshTokenHash));
    }

    await multi
      .hSet(sessionKey, this.serializeSession(session))
      .expire(sessionKey, refreshTtlSeconds)
      .set(refreshKey, session.sessionId, { EX: refreshTtlSeconds })
      .zAdd(userSessionsKey, { score: session.lastSeenAt, value: session.sessionId })
      .exec();
  }

  // 将认证会话序列化为 Redis Hash 可写入的字符串字典
  private serializeSession(session: AuthSessionRecord): Record<string, string> {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      account: session.account,
      role: session.role,
      tenantId: session.tenantId ?? '',
      status: session.status,
      refreshTokenHash: session.refreshTokenHash,
      createdAt: String(session.createdAt),
      lastSeenAt: String(session.lastSeenAt),
      accessExpiresAt: String(session.accessExpiresAt),
      refreshExpiresAt: String(session.refreshExpiresAt),
    };
  }

  // 将 Redis Hash 读出的字符串字典还原为业务侧使用的认证会话对象
  private deserializeSession(raw: Record<string, string>): AuthSessionRecord {
    return {
      sessionId: raw.sessionId,
      userId: raw.userId,
      account: raw.account,
      role: raw.role as UserRole,
      tenantId: raw.tenantId || null,
      status: raw.status as SessionStatus,
      refreshTokenHash: raw.refreshTokenHash,
      createdAt: Number.parseInt(raw.createdAt, 10),
      lastSeenAt: Number.parseInt(raw.lastSeenAt, 10),
      accessExpiresAt: Number.parseInt(raw.accessExpiresAt, 10),
      refreshExpiresAt: Number.parseInt(raw.refreshExpiresAt, 10),
    };
  }

  // 生成单个会话记录的 Redis key
  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  // 生成用户会话集合的 Redis key 用于维护该用户的活动会话列表
  private getUserSessionsKey(userId: string): string {
    return `user:sessions:${userId}`;
  }

  // 生成用户 token 版本号的 Redis key 用于全局 token 失效控制
  private getUserTokenVersionKey(userId: string): string {
    return `user:tokenVersion:${userId}`;
  }

  // 生成 refresh token 哈希索引的 Redis key 用于通过 refresh token 反查 sessionId
  private getRefreshTokenKeyByHash(refreshTokenHash: string): string {
    return `refresh:${refreshTokenHash}`;
  }

  // 对 refresh token 做 SHA-256 哈希 避免在 Redis 中直接保存明文 token
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
