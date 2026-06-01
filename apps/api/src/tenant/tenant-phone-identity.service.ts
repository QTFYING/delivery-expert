import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserStatusEnum as PrismaUserStatusEnum } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantPhoneIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  /** 校验有效 Tenant 用户手机号在全平台租户范围内唯一，平台用户手机号不参与此规则 */
  async assertTenantPhoneAvailable(
    phone: string,
    excludeUserId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      return;
    }

    const existing = await client.user.findFirst({
      where: {
        phone: normalizedPhone,
        tenantId: { not: null },
        deletedAt: null,
        status: PrismaUserStatusEnum.ACTIVE,
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('租户用户手机号已存在');
    }
  }
}
