import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { AuthMeResponse, AuthUserProfile, ChangePasswordRequest } from '@shou/types/contracts';
import { TenantStatusEnum, UserRoleEnum, UserStatusEnum } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PermissionCacheService } from '../authorization/permission-cache.service';
import { PermissionService } from '../authorization/permission.service';
import { assertPasswordStrength } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionStore } from '../redis/auth-session.store';
import { fromPrismaTenantStatus, fromPrismaUserRole, fromPrismaUserStatus } from '../tenant/mapping/tenant.mapper';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from './auth-session.util';
import { JwtPayload } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';

const INVALID_CREDENTIALS_MESSAGE = '用户名或密码错误';
const ACCOUNT_UNAVAILABLE_MESSAGE = '账号不可用';
const TENANT_UNAVAILABLE_MESSAGE = '租户不可用';
const ACCOUNT_CONFLICT_MESSAGE = '账号存在冲突，请联系管理员处理';

type AuthUserRecord = Prisma.UserGetPayload<{
  include: {
    tenant: true;
  };
}>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private authSessions: AuthSessionStore,
    private permissionCache: PermissionCacheService,
    private permissionService: PermissionService,
  ) {}

  // 校验账号密码并创建新的登录会话 返回 access token 与 refresh token
  async login(loginDto: LoginDto) {
    const account = loginDto.account.trim();
    const password = loginDto.password.trim();
    const user = await this.findLoginUser(account, password);
    const tokenVersion = await this.authSessions.getUserTokenVersion(user.id);
    const permissionVersion = await this.getTokenPermissionVersion(user);
    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomBytes(48).toString('hex');
    await this.authSessions.createAuthSession(
      {
        sessionId,
        userId: user.id,
        account: user.account,
        role: fromPrismaUserRole(user.role),
        tenantId: user.tenantId,
      },
      refreshToken,
      ACCESS_TOKEN_TTL,
      REFRESH_TOKEN_TTL,
    );
    const accessToken = this.jwtService.sign(this.buildAccessTokenPayload(user, sessionId, tokenVersion, permissionVersion));

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL,
      refreshToken,
      user: this.toUserProfile(user),
    };
  }

  // 使用 refresh token 续签会话 并返回新的 token 对
  async refresh(refreshToken: string) {
    const session = await this.authSessions.getAuthSessionByRefreshToken(refreshToken);
    if (!session || session.status !== 'active') {
      throw new UnauthorizedException('Refresh Token 已失效，请重新登录');
    }

    const user = await this.getAvailableUserById(session.userId);
    const tokenVersion = await this.authSessions.getUserTokenVersion(user.id);
    const permissionVersion = await this.getTokenPermissionVersion(user);
    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const nextSession = await this.authSessions.refreshAuthSession(
      session.sessionId,
      {
        userId: user.id,
        account: user.account,
        role: fromPrismaUserRole(user.role),
        tenantId: user.tenantId,
      },
      newRefreshToken,
      ACCESS_TOKEN_TTL,
      REFRESH_TOKEN_TTL,
    );
    if (!nextSession) {
      throw new UnauthorizedException('Refresh Token 已失效，请重新登录');
    }

    const accessToken = this.jwtService.sign(this.buildAccessTokenPayload(user, nextSession.sessionId, tokenVersion, permissionVersion));

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL,
      refreshToken: newRefreshToken,
    };
  }

  // 读取当前登录用户资料与 Tenant 权限快照 平台用户不进入 Tenant RBAC
  async getMe(currentUser: JwtPayload): Promise<AuthMeResponse> {
    const user = await this.getAvailableUserById(currentUser.userId);
    const profile = this.toUserProfile(user);
    if (!user.tenantId) {
      return {
        ...profile,
        roleId: null,
        roleCode: UserRoleEnum.OS_SUPER_ADMIN,
        roleName: '平台超级管理员',
        permissions: [],
        permissionVersion: 0,
      };
    }

    const snapshot = await this.permissionService.getTenantPermissionSnapshot(user.tenantId, user.id);
    return {
      ...profile,
      roleId: snapshot.roleId,
      roleCode: snapshot.roleCode,
      roleName: snapshot.roleName,
      permissions: snapshot.permissions,
      permissionVersion: snapshot.permissionVersion,
    };
  }

  // 修改当前登录用户密码 并使全部旧会话失效
  async changePassword(currentUser: JwtPayload, request: ChangePasswordRequest): Promise<void> {
    const user = await this.getAvailableUserById(currentUser.userId);
    const currentPasswordMatched = await bcrypt.compare(request.currentPassword, user.passwordHash);
    if (!currentPasswordMatched) {
      throw new UnauthorizedException('当前密码错误');
    }

    const samePassword = await bcrypt.compare(request.newPassword, user.passwordHash);
    if (samePassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    assertPasswordStrength(request.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(request.newPassword, 10),
        requiresPasswordReset: false,
      },
    });

    await this.authSessions.bumpUserTokenVersion(user.id);
    await this.authSessions.revokeAllUserSessions(user.id);
  }

  // 注销会话 优先按 refresh token 清理 再兜底按 access token 中的 sessionId 清理
  async logout(accessToken: string | null, refreshToken?: string) {
    if (refreshToken) {
      const session = await this.authSessions.getAuthSessionByRefreshToken(refreshToken);
      if (session) {
        await this.authSessions.revokeAuthSession(session.sessionId);
      }
    }

    if (accessToken) {
      const payload = this.jwtService.decode(accessToken);
      if (payload && typeof payload === 'object' && typeof payload.sid === 'string') {
        await this.authSessions.revokeAuthSession(payload.sid);
      }
    }
  }

  // 按账号查找候选用户并校验密码 最后收敛为一个可登录的用户
  private async findLoginUser(account: string, password: string): Promise<AuthUserRecord> {
    const users = await this.prisma.user.findMany({
      where: {
        account,
        deletedAt: null,
      },
      include: {
        tenant: true,
      },
    });

    if (users.length === 0) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatchedUsers: AuthUserRecord[] = [];
    for (const user of users) {
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (isMatch) {
        passwordMatchedUsers.push(user);
      }
    }

    if (passwordMatchedUsers.length === 0) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const availableUsers: AuthUserRecord[] = [];
    let unavailableError: UnauthorizedException | null = null;

    for (const user of passwordMatchedUsers) {
      try {
        this.assertUserAvailable(user);
        availableUsers.push(user);
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          unavailableError = error;
          continue;
        }
        throw error;
      }
    }

    if (availableUsers.length === 1) {
      return availableUsers[0];
    }

    if (availableUsers.length > 1) {
      throw new UnauthorizedException(ACCOUNT_CONFLICT_MESSAGE);
    }

    throw unavailableError ?? new UnauthorizedException(ACCOUNT_UNAVAILABLE_MESSAGE);
  }

  // 按用户 ID 读取用户 并校验账号与租户是否仍处于可登录状态
  private async getAvailableUserById(userId: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
      },
    });

    this.assertUserAvailable(user);
    return user;
  }

  // 统一校验用户和租户是否有效 无效时抛出登录态相关异常
  private assertUserAvailable(user: AuthUserRecord | null): asserts user is AuthUserRecord {
    if (!user || user.deletedAt || fromPrismaUserStatus(user.status) !== UserStatusEnum.ACTIVE) {
      throw new UnauthorizedException(ACCOUNT_UNAVAILABLE_MESSAGE);
    }

    if (!user.tenantId) {
      return;
    }

    if (!user.tenant || user.tenant.deletedAt) {
      throw new UnauthorizedException(TENANT_UNAVAILABLE_MESSAGE);
    }

    const tenantStatus = fromPrismaTenantStatus(user.tenant.status);
    if (tenantStatus === TenantStatusEnum.ACTIVE) {
      return;
    }

    if (tenantStatus === TenantStatusEnum.ONBOARDING && fromPrismaUserRole(user.role) === UserRoleEnum.TENANT_OWNER) {
      return;
    }

    throw new UnauthorizedException(TENANT_UNAVAILABLE_MESSAGE);
  }

  // 读取 access token 内使用的权限版本 平台用户固定为 0
  private async getTokenPermissionVersion(user: AuthUserRecord): Promise<number> {
    if (!user.tenantId) {
      return 0;
    }

    return this.permissionCache.getTenantPermissionVersion(user.tenantId, user.id);
  }

  // 构造 access token 的业务载荷 统一收口 tenant 和 platform 双侧会话语义
  private buildAccessTokenPayload(
    user: AuthUserRecord,
    sessionId: string,
    tokenVersion: number,
    permissionVersion: number,
  ): Omit<JwtPayload, 'userId' | 'sessionId' | 'tokenVersion' | 'permissionVersion'> & {
    sub: string;
    sid: string;
    ver: number;
    pver?: number;
  } {
    return {
      sub: user.id,
      sid: sessionId,
      ver: tokenVersion,
      pver: user.tenantId ? permissionVersion : undefined,
      tenantId: user.tenantId,
      role: fromPrismaUserRole(user.role),
      side: user.tenantId ? 'tenant' : 'platform',
    };
  }

  // 将数据库用户记录裁剪为接口返回给前端的用户资料视图
  private toUserProfile(user: AuthUserRecord): AuthUserProfile {
    return {
      id: user.id,
      account: user.account,
      realName: user.realName,
      tenantId: user.tenantId,
      requiresPasswordReset: user.requiresPasswordReset,
    };
  }
}
