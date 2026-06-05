import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { SmsCodeSceneEnum, TenantStatusEnum, UserRoleEnum, UserStatusEnum } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PermissionCacheService } from '../authorization/permission-cache.service';
import { assertPasswordStrength } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionStore } from '../redis/auth-session.store';
import { CaptchaService } from '../sms/captcha.service';
import { SmsCodeStore } from '../sms/sms-code.store';
import { SmsService } from '../sms/sms.service';
import { fromPrismaTenantStatus, fromPrismaUserRole, fromPrismaUserStatus } from '../tenant/mapping/tenant.mapper';
import { UploadService } from '../upload/upload.service';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from './auth-session.util';
import { JwtPayload } from './decorators/current-user.decorator';
import { DebugSmsCodeQueryDto } from './dto/debug-sms-code-query.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { SendSmsCodeDto } from './dto/send-sms-code.dto';
import { SmsLoginDto } from './dto/sms-login.dto';

const SMS_AUTH_INVALID_MESSAGE = '手机号或验证码错误';
const ACCOUNT_UNAVAILABLE_MESSAGE = '账号不可用';
const TENANT_UNAVAILABLE_MESSAGE = '租户不可用';

type AuthUserRecord = Prisma.UserGetPayload<{
  include: {
    tenant: true;
  };
}>;

@Injectable()
export class AuthSmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authSessions: AuthSessionStore,
    private readonly permissionCache: PermissionCacheService,
    private readonly captchaService: CaptchaService,
    private readonly smsCodeStore: SmsCodeStore,
    private readonly smsService: SmsService,
    private readonly uploadService: UploadService,
  ) {}

  /** 发送 Tenant 短信验证码；手机号无法唯一定位有效用户时静默返回，避免暴露账号存在性 */
  async sendSmsCode(request: SendSmsCodeDto, ip?: string): Promise<void> {
    const phone = request.phone.trim();
    const user = await this.resolveSingleAvailableTenantUserByPhone(phone);
    if (!user) {
      return;
    }

    const captchaResult = await this.captchaService.verifyIntelligentCaptcha({
      captchaVerifyParam: request.captchaVerifyParam,
    });
    if (!captchaResult.verified) {
      throw new UnauthorizedException('滑块验证失败');
    }

    const issuedCode = await this.smsCodeStore.issueCode({
      phone,
      scene: request.scene,
      ip,
    });

    try {
      await this.smsService.sendVerificationCode({
        phone,
        scene: request.scene,
        code: issuedCode.code,
        validMinutes: issuedCode.validMinutes,
        outId: user.id,
      });
    } catch (error) {
      await this.smsCodeStore.clearCode({ phone, scene: request.scene, clearCooldown: true });
      throw error;
    }
  }

  /** 使用 Tenant 手机号短信验证码创建登录会话，只允许唯一有效 Tenant 用户进入 */
  async smsLogin(request: SmsLoginDto) {
    const phone = request.phone.trim();
    const user = await this.getSingleAvailableTenantUserByPhoneOrThrow(phone);
    await this.consumeCodeOrThrow({
      phone,
      scene: SmsCodeSceneEnum.TENANT_LOGIN,
      code: request.code.trim(),
    });

    return this.createLoginSession(user);
  }

  /** 使用 Tenant 手机号短信验证码重置密码，并撤销该用户全部旧会话 */
  async resetPassword(request: PasswordResetDto): Promise<void> {
    const phone = request.phone.trim();
    const user = await this.getSingleAvailableTenantUserByPhoneOrThrow(phone);
    await this.consumeCodeOrThrow({
      phone,
      scene: SmsCodeSceneEnum.TENANT_PASSWORD_RESET,
      code: request.code.trim(),
    });

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

  /** 查询 Redis debug 明文验证码；仅供配置允许时的联调入口使用 */
  async getDebugSmsCode(query: DebugSmsCodeQueryDto) {
    const phone = query.phone.trim();
    const result = await this.smsCodeStore.getDebugCode({ phone, scene: query.scene });
    if (!result) {
      return null;
    }

    return {
      phone,
      scene: query.scene,
      code: result.code,
      expiresAt: new Date(Date.now() + result.expiresInSeconds * 1000).toISOString(),
    };
  }

  /** 按手机号解析唯一有效 Tenant 用户；任何无法唯一登录的情况都返回 null */
  private async resolveSingleAvailableTenantUserByPhone(phone: string): Promise<AuthUserRecord | null> {
    const users = await this.prisma.user.findMany({
      where: {
        phone,
        tenantId: { not: null },
        deletedAt: null,
      },
      include: {
        tenant: true,
      },
    });

    if (users.length !== 1) {
      return null;
    }

    try {
      this.assertTenantUserAvailable(users[0]);
      return users[0];
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return null;
      }
      throw error;
    }
  }

  /** 按手机号解析唯一有效 Tenant 用户；登录和找回密码失败时统一抛出泛化认证错误 */
  private async getSingleAvailableTenantUserByPhoneOrThrow(phone: string): Promise<AuthUserRecord> {
    const user = await this.resolveSingleAvailableTenantUserByPhone(phone);
    if (!user) {
      throw new UnauthorizedException(SMS_AUTH_INVALID_MESSAGE);
    }
    return user;
  }

  /** 消费短信验证码，错误、过期、重复使用和超限都统一收敛为泛化认证错误 */
  private async consumeCodeOrThrow(input: {
    phone: string;
    scene: (typeof SmsCodeSceneEnum)[keyof typeof SmsCodeSceneEnum];
    code: string;
  }): Promise<void> {
    const result = await this.smsCodeStore.consumeCode(input);
    if (!result.consumed) {
      throw new UnauthorizedException(SMS_AUTH_INVALID_MESSAGE);
    }
  }

  /** 创建登录会话并签发 access token 与 refresh token */
  private async createLoginSession(user: AuthUserRecord) {
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

  /** 校验短信认证只允许有效 Tenant 用户进入，不接受平台用户 */
  private assertTenantUserAvailable(user: AuthUserRecord | null): asserts user is AuthUserRecord {
    if (!user || user.deletedAt || !user.tenantId || fromPrismaUserStatus(user.status) !== UserStatusEnum.ACTIVE) {
      throw new UnauthorizedException(ACCOUNT_UNAVAILABLE_MESSAGE);
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

  /** 读取 access token 内使用的权限版本，短信认证只面向 Tenant 用户 */
  private async getTokenPermissionVersion(user: AuthUserRecord): Promise<number> {
    if (!user.tenantId) {
      return 0;
    }

    return this.permissionCache.getTenantPermissionVersion(user.tenantId, user.id);
  }

  /** 构造 access token 的业务载荷，短信登录固定进入 Tenant 侧会话 */
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
      pver: permissionVersion,
      tenantId: user.tenantId,
      role: fromPrismaUserRole(user.role),
      side: 'tenant',
    };
  }

  /** 将数据库用户记录裁剪为接口返回给前端的用户资料视图 */
  private toUserProfile(user: AuthUserRecord) {
    return {
      id: user.id,
      account: user.account,
      realName: user.realName,
      tenantId: user.tenantId,
      avatarUrl: this.uploadService.buildPublicUrl(user.avatarObjectKey),
      requiresPasswordReset: user.requiresPasswordReset,
    };
  }
}
