import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export function getOrderTenantId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于租户侧，无法操作订单');
  }

  return currentUser.tenantId;
}

export async function assertAllOrdersOwned(client: Prisma.TransactionClient | PrismaService, tenantId: string, orderIds: string[]): Promise<void> {
  const count = await client.order.count({
    where: { tenantId, deletedAt: null, id: { in: orderIds } },
  });
  if (count !== orderIds.length) {
    throw new BadRequestException('存在无效订单 ID 或跨租户订单');
  }
}

export async function getOrderActorName(prisma: PrismaService, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      realName: true,
      account: true,
    },
  });

  return user?.realName || user?.account || userId;
}

export function normalizeReminderChannels(channels?: string[]): string[] {
  const allowed = new Set(['sms', 'wechat']);
  const normalized = Array.from(new Set((channels ?? ['sms']).map((item) => item.trim()).filter(Boolean)));

  if (normalized.length === 0) {
    return ['sms'];
  }
  if (normalized.some((item) => !allowed.has(item))) {
    throw new BadRequestException('channels 仅支持 sms、wechat');
  }

  return normalized;
}
