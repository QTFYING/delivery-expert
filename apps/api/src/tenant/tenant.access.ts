import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRoleEnum } from '@prisma/client';
import type { TenantListQuery, TenantMemberListQuery } from '@shou/types/contracts';
import { SortOrderEnum, TenantSideEnum, TenantSortFieldEnum } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaTenantStatus } from './mapping/tenant.mapper';

export function buildTenantListWhere(query: TenantListQuery): Prisma.TenantWhereInput {
  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
  };

  if (query.status) {
    where.status = toPrismaTenantStatus(query.status);
  }
  if (query.keyword?.trim()) {
    const keyword = query.keyword.trim();
    where.OR = [
      { id: keyword },
      { name: { contains: keyword, mode: 'insensitive' } },
      { adminName: { contains: keyword, mode: 'insensitive' } },
      {
        users: {
          some: {
            deletedAt: null,
            role: UserRoleEnum.TENANT_OWNER,
            OR: [{ realName: { contains: keyword, mode: 'insensitive' } }, { account: { contains: keyword, mode: 'insensitive' } }],
          },
        },
      },
    ];
  }

  return where;
}

export function buildTenantOrderBy(query: TenantListQuery): Prisma.TenantOrderByWithRelationInput[] {
  const sortOrder = query.sortOrder === SortOrderEnum.ASC ? 'asc' : 'desc';
  switch (query.sortBy) {
    case TenantSortFieldEnum.NAME:
      return [{ name: sortOrder }];
    case TenantSortFieldEnum.SOFTWARE_VERSION:
      return [{ softwareVersion: sortOrder }];
    case TenantSortFieldEnum.STATUS:
      return [{ status: sortOrder }];
    case TenantSortFieldEnum.DUE_IN_DAYS:
      return [{ serviceExpireAt: { sort: sortOrder, nulls: 'last' } }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

export function buildTenantMemberWhere(query: TenantMemberListQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
  };

  if (query.tenantType === TenantSideEnum.PLATFORM) {
    where.tenantId = null;
  }
  if (query.tenantType === TenantSideEnum.TENANT) {
    where.tenantId = { not: null };
  }

  return where;
}

export async function getTenantOrThrow(prisma: PrismaService, tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });

  if (!tenant) {
    throw new NotFoundException('租户不存在');
  }

  return tenant;
}

export function getTenantId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于租户侧');
  }

  return currentUser.tenantId;
}
