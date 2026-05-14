import { HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { TenantStatusEnum, UserRoleEnum, UserStatusEnum } from '@shou/types/enums';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig } from '../config/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionStore } from '../redis/auth-session.store';
import { fromPrismaTenantStatus, fromPrismaUserRole, fromPrismaUserStatus } from '../tenant/mapping/tenant.mapper';
import { BusinessException } from '../common/exceptions/business.exception';
import { JwtPayload } from './decorators/current-user.decorator';

const PASSWORD_RESET_REQUIRED_CODE = 4002;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(authConfig.KEY)
    authSettings: ConfigType<typeof authConfig>,
    private authSessions: AuthSessionStore,
    private prisma: PrismaService,
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
      throw new UnauthorizedException('Token 无效，请重新登录');
    }

    const session = await this.authSessions.getAuthSession(sessionId);
    if (!session || session.status !== 'active' || session.userId !== userId) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    const currentTokenVersion = await this.authSessions.getUserTokenVersion(userId);
    if (tokenVersion !== currentTokenVersion) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
      },
    });

    if (!user || user.deletedAt || fromPrismaUserStatus(user.status) !== UserStatusEnum.ACTIVE) {
      throw new UnauthorizedException('账号不可用');
    }

    const userRole = fromPrismaUserRole(user.role);
    if (user.tenantId) {
      this.assertTenantAvailable(user.tenant, userRole);
      this.assertTenantPasswordResetAccessAllowed(req, user.requiresPasswordReset);
    }

    await this.authSessions.touchAuthSession(sessionId, user.id);

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: userRole,
      side: user.tenantId ? 'tenant' : 'platform',
      sessionId,
      tokenVersion,
    };
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
  private assertTenantPasswordResetAccessAllowed(req: Request, requiresPasswordReset: boolean): void {
    if (!requiresPasswordReset) {
      return;
    }

    if (this.isPasswordResetAllowedRoute(req)) {
      return;
    }

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
}
