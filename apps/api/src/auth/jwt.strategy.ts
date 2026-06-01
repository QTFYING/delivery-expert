import { HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { TenantStatusEnum, UserRoleEnum, UserStatusEnum } from '@shou/types/enums';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig } from '../config/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionStore } from '../redis/auth-session.store';
import { PermissionCacheService } from '../authorization/permission-cache.service';
import { fromPrismaTenantStatus, fromPrismaUserRole, fromPrismaUserStatus } from '../tenant/mapping/tenant.mapper';
import { BusinessException } from '../common/exceptions/business.exception';
import { formatTraceLog } from '../common/trace-log';
import { JwtPayload } from './decorators/current-user.decorator';

const PASSWORD_RESET_REQUIRED_CODE = 4002;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @Inject(authConfig.KEY)
    authSettings: ConfigType<typeof authConfig>,
    private authSessions: AuthSessionStore,
    private prisma: PrismaService,
    private permissionCache: PermissionCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authSettings.jwtSecret,
      passReqToCallback: true,
    });
  }

  // 校验 access token 对应的 session tokenVersion 用户状态与租户状态 并回写最近访问时间
  async validate(req: Request, payload: Record<string, unknown>): Promise<JwtPayload> {
    const userId = payload.sub;
    const sessionId = payload.sid;
    const tokenVersion = payload.ver;
    if (typeof userId !== 'string' || typeof sessionId !== 'string' || typeof tokenVersion !== 'number') {
      this.logJwtDenied('payload_invalid');
      throw new UnauthorizedException('Token 无效，请重新登录');
    }

    const session = await this.authSessions.getAuthSession(sessionId);
    if (!session || session.status !== 'active' || session.userId !== userId) {
      this.logJwtDenied('session_inactive', { userId });
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    const currentTokenVersion = await this.authSessions.getUserTokenVersion(userId);
    if (tokenVersion !== currentTokenVersion) {
      this.logJwtDenied('token_version_mismatch', { userId, tokenVersion, currentTokenVersion });
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
      },
    });

    if (!user || user.deletedAt || fromPrismaUserStatus(user.status) !== UserStatusEnum.ACTIVE) {
      this.logJwtDenied('account_unavailable', { userId });
      throw new UnauthorizedException('账号不可用');
    }

    const userRole = fromPrismaUserRole(user.role);
    const permissionVersion = await this.resolvePermissionVersion(payload, user.tenantId, user.id);
    if (user.tenantId) {
      try {
        this.assertTenantAvailable(user.tenant, userRole);
      } catch (error) {
        this.logJwtDenied('tenant_unavailable', { userId: user.id, tenantId: user.tenantId, role: userRole });
        throw error;
      }
    }
    this.assertPasswordResetAccessAllowed(req, user.requiresPasswordReset, user.id, user.tenantId, userRole);

    await this.authSessions.touchAuthSession(sessionId, user.id);

    this.logger.log(
      formatTraceLog('auth.jwt.validated', {
        userId: user.id,
        tenantId: user.tenantId ?? 'null',
        side: user.tenantId ? 'tenant' : 'platform',
        role: userRole,
        tokenVersion,
        permissionVersion,
        requiresPasswordReset: user.requiresPasswordReset,
      }),
    );

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: userRole,
      side: user.tenantId ? 'tenant' : 'platform',
      sessionId,
      tokenVersion,
      permissionVersion,
    };
  }

  // 兼容读取 JWT 内权限版本 旧 token 没有 pver 时按 Redis 当前版本补齐
  private async resolvePermissionVersion(payload: Record<string, unknown>, tenantId: string | null, userId: string): Promise<number> {
    if (!tenantId) {
      return 0;
    }

    const payloadPermissionVersion = payload.pver ?? payload.permissionVersion;
    if (typeof payloadPermissionVersion === 'number' && Number.isInteger(payloadPermissionVersion) && payloadPermissionVersion > 0) {
      return payloadPermissionVersion;
    }

    return this.permissionCache.getTenantPermissionVersion(tenantId, userId);
  }

  // 校验租户状态是否允许当前角色继续访问受保护接口
  private assertTenantAvailable(
    tenant: {
      deletedAt: Date | null;
      status: Parameters<typeof fromPrismaTenantStatus>[0];
    } | null,
    userRole: JwtPayload['role'],
  ): void {
    if (!tenant || tenant.deletedAt) {
      throw new UnauthorizedException('租户不可用');
    }

    const tenantStatus = fromPrismaTenantStatus(tenant.status);
    if (tenantStatus === TenantStatusEnum.ACTIVE) {
      return;
    }

    if (tenantStatus === TenantStatusEnum.ONBOARDING && userRole === UserRoleEnum.TENANT_OWNER) {
      return;
    }

    throw new UnauthorizedException('租户不可用');
  }

  // 在首次改密阶段 仅允许访问最小认证接口
  private assertPasswordResetAccessAllowed(
    req: Request,
    requiresPasswordReset: boolean,
    userId: string,
    tenantId: string | null,
    userRole: JwtPayload['role'],
  ): void {
    if (!requiresPasswordReset) {
      return;
    }

    if (this.isPasswordResetAllowedRoute(req)) {
      return;
    }

    this.logJwtDenied('password_reset_required', { userId, tenantId: tenantId ?? 'null', role: userRole });
    throw new BusinessException(PASSWORD_RESET_REQUIRED_CODE, '当前账号需先修改密码', HttpStatus.FORBIDDEN);
  }

  // 判断当前请求是否属于首次改密阶段允许放行的认证接口
  private isPasswordResetAllowedRoute(req: Request): boolean {
    const requestMethod = req.method.toUpperCase();
    const requestPath = (req.originalUrl || req.url || '').split('?')[0];

    return (
      (requestMethod === 'GET' && requestPath.endsWith('/auth/me')) || (requestMethod === 'POST' && requestPath.endsWith('/auth/change-password'))
    );
  }

  // 输出 JWT 拒绝原因，仅记录用户和租户上下文，不记录 token 内容
  private logJwtDenied(reason: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
    this.logger.warn(formatTraceLog('auth.jwt.denied', { ...fields, reason }));
  }
}
