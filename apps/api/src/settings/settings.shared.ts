import { ForbiddenException } from '@nestjs/common';
import { AuditResultEnum as PrismaAuditResultEnum, AuditTargetTypeEnum as PrismaAuditTargetTypeEnum } from '@prisma/client';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export function getTenantSideId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于租户侧，无法访问通用配置');
  }

  return currentUser.tenantId;
}

export async function getOperatorDisplayName(prisma: PrismaService, userId: string): Promise<string | undefined> {
  const operator = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      realName: true,
      account: true,
    },
  });

  return operator?.realName || operator?.account || undefined;
}

export async function createAuditLog(
  prisma: PrismaService,
  currentUser: JwtPayload,
  input: {
    tenantId: string | null;
    action: string;
    target: string;
    targetType: PrismaAuditTargetTypeEnum;
    ip?: string;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: (await getOperatorDisplayName(prisma, currentUser.userId)) ?? currentUser.role,
      action: input.action,
      target: input.target,
      targetType: input.targetType,
      tenantId: input.tenantId,
      result: PrismaAuditResultEnum.SUCCESS,
      ip: input.ip?.trim() || null,
    },
  });
}
