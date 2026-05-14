import { Injectable } from '@nestjs/common';
import type { TenantProfile } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { toTenantProfile } from './mapping/tenant.mapper';
import { getTenantId } from './tenant.access';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取当前登录态所属租户的主体资料，只读返回，不承载用户资料语义。
  async getTenantProfile(currentUser: JwtPayload): Promise<TenantProfile> {
    const tenantId = getTenantId(currentUser);

    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: {
        id: tenantId,
        deletedAt: null,
      },
    });

    return toTenantProfile(tenant);
  }
}
