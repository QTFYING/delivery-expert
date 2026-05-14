import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum, UserRoleEnum } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { AuthSessionStore } from '../redis/auth-session.store';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantPrismaRoles } from './mapping/settings.mapper';
import { createAuditLog, getTenantSideId } from './settings.shared';

const DEFAULT_TENANT_USER_PASSWORD = '123456';

@Injectable()
export class SettingsUserPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authSessions: AuthSessionStore,
  ) {}

  // 将本租户员工密码重置为默认密码并强制下次改密
  async resetEmployeePassword(currentUser: JwtPayload, userId: string, ip?: string): Promise<null> {
    const tenantId = getTenantSideId(currentUser);
    if (currentUser.userId === userId) {
      throw new ConflictException('不能重置自己密码');
    }

    const targetUser = await this.getTenantUserOrThrow(tenantId, userId);
    if (targetUser.role === UserRoleEnum.TENANT_OWNER) {
      throw new ConflictException('不能重置老板账号密码');
    }

    await this.prisma.user.update({
      where: { id: targetUser.id },
      data: {
        passwordHash: await bcrypt.hash(DEFAULT_TENANT_USER_PASSWORD, 10),
        requiresPasswordReset: true,
      },
    });

    await this.authSessions.bumpUserTokenVersion(targetUser.id);
    await this.authSessions.revokeAllUserSessions(targetUser.id);

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '重置员工密码',
      target: targetUser.realName || targetUser.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return null;
  }

  // 查询当前租户作用域内的目标用户并阻止跨租户重置
  private async getTenantUserOrThrow(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
        role: {
          in: getTenantPrismaRoles(),
        },
      },
    });

    if (!user) {
      throw new NotFoundException('租户用户不存在');
    }

    return user;
  }
}
