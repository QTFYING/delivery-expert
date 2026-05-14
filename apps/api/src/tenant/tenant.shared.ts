import { AuditResultEnum as PrismaAuditResultEnum, AuditTargetTypeEnum as PrismaAuditTargetTypeEnum } from '@prisma/client';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

type TenantAuditPrismaClient = {
  user: Pick<PrismaService['user'], 'findUnique'>;
  auditLog: Pick<PrismaService['auditLog'], 'create'>;
};

export async function getTenantActorName(prisma: TenantAuditPrismaClient, userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      realName: true,
      account: true,
    },
  });

  return user?.realName || user?.account || null;
}

export async function createTenantAuditLog(
  prisma: TenantAuditPrismaClient,
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
      actor: (await getTenantActorName(prisma, currentUser.userId)) ?? currentUser.role,
      action: input.action,
      target: input.target,
      targetType: input.targetType,
      tenantId: input.tenantId,
      result: PrismaAuditResultEnum.SUCCESS,
      ip: input.ip?.trim() || null,
    },
  });
}
