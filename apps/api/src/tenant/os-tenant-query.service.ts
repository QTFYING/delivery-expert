import { Injectable } from '@nestjs/common';
import type { TenantListQuery, TenantMemberItem, TenantMemberListQuery, TenantRecordItem } from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import dayjs from 'dayjs';
import { normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { toTenantMemberItem, toTenantRecordItem } from './mapping/tenant.mapper';
import { buildTenantListWhere, buildTenantMemberWhere, buildTenantOrderBy } from './tenant.access';

@Injectable()
export class OsTenantQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取 OS 侧租户列表。
  async getTenants(query: TenantListQuery): Promise<PaginatedResponse<TenantRecordItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const monthStart = dayjs().startOf('month').toDate();
    const where = buildTenantListWhere(query);

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          users: {
            where: { deletedAt: null },
            select: { id: true, loginAt: true },
          },
          payments: {
            where: { paidAt: { gte: monthStart } },
            select: { amount: true },
          },
          paymentOrders: {
            select: { channel: true },
          },
        },
        orderBy: buildTenantOrderBy(query),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      list: tenants.map((tenant) => {
        const mapped = toTenantRecordItem(tenant);
        return {
          ...mapped,
          lastActiveAt: dayjs(mapped.lastActiveAt).format('YYYY-MM-DD HH:mm:ss'),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // 获取 OS 侧组织架构成员列表。
  async getTenantMembers(query: TenantMemberListQuery): Promise<PaginatedResponse<TenantMemberItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where = buildTenantMemberWhere(query);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { tenant: true },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list: users.map((user) => toTenantMemberItem(user)),
      total,
      page,
      pageSize,
    };
  }
}
