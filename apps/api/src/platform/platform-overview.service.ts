import { Injectable } from '@nestjs/common';
import { PaymentRecordStatusEnum, TenantStatusEnum as PrismaTenantStatusEnum } from '@prisma/client';
import type { PlatformOverviewResponse, TenantHealthItem } from '@shou/types/contracts';
import dayjs from 'dayjs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaTenantStatus } from '../tenant/mapping/tenant.mapper';
import {
  ACTIVE_USER_WINDOW_DAYS,
  resolveDueInDays,
  resolveTenantException,
  resolveTenantHealthScore,
  resolveUserCoverage,
  toMoney,
} from './mapping/platform.mapper';
import { ensurePlatformScope } from './platform.scope';

const OVERVIEW_RENEWAL_WINDOW_DAYS = 30;

@Injectable()
export class PlatformOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取平台侧租户健康度列表，并在入口处校验平台作用域
  async getTenantHealth(currentUser: JwtPayload): Promise<TenantHealthItem[]> {
    ensurePlatformScope(currentUser);
    return this.buildTenantHealthItems();
  }

  // 聚合平台概览指标，并将服务到期时间派生成续费风险天数
  async getOverview(currentUser: JwtPayload): Promise<PlatformOverviewResponse> {
    ensurePlatformScope(currentUser);

    const todayStart = dayjs().startOf('day');
    const monthStart = dayjs().startOf('month');
    const sevenDayStart = dayjs().subtract(6, 'day').startOf('day');
    const renewalDeadline = dayjs().add(OVERVIEW_RENEWAL_WINDOW_DAYS, 'day').endOf('day');

    const tenantHealthItemsPromise = this.buildTenantHealthItems();
    const recentTenantsPromise = this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        createdAt: {
          gte: sevenDayStart.toDate(),
        },
      },
      select: {
        createdAt: true,
      },
    });

    const [
      totalTenants,
      newTenantsThisMonth,
      activeNewTenants,
      totalFlowAggregate,
      churnWarningCount,
      renewalRiskTenants,
      tenantHealthItems,
      recentTenants,
    ] = await Promise.all([
      this.prisma.tenant.count({
        where: { deletedAt: null },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: monthStart.toDate() },
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          createdAt: { gte: monthStart.toDate() },
          status: PrismaTenantStatusEnum.ACTIVE,
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentRecordStatusEnum.SUCCESS,
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          OR: [
            {
              serviceExpireAt: {
                gte: todayStart.toDate(),
                lte: renewalDeadline.toDate(),
              },
            },
            { status: PrismaTenantStatusEnum.ATTENTION },
            { status: PrismaTenantStatusEnum.PAUSED },
          ],
        },
      }),
      this.prisma.tenant.findMany({
        where: {
          deletedAt: null,
          serviceExpireAt: {
            gte: todayStart.toDate(),
            lte: renewalDeadline.toDate(),
          },
        },
        orderBy: [{ serviceExpireAt: 'asc' }, { createdAt: 'asc' }],
        take: 10,
        select: {
          name: true,
          adminName: true,
          serviceExpireAt: true,
        },
      }),
      tenantHealthItemsPromise,
      recentTenantsPromise,
    ]);

    const totalFlow = toMoney(totalFlowAggregate._sum.amount);
    const healthScore =
      tenantHealthItems.length > 0 ? Math.round(tenantHealthItems.reduce((sum, item) => sum + item.health, 0) / tenantHealthItems.length) : 0;

    const dailyTrend = Array.from({ length: 7 }, (_, index) => {
      const current = sevenDayStart.add(index, 'day');
      return recentTenants.filter((tenant) => dayjs(tenant.createdAt).isSame(current, 'day')).length;
    });

    return {
      totalFlow,
      totalTenants,
      newTenantsThisMonth,
      healthScore,
      growth: {
        newTenants: newTenantsThisMonth,
        trialToFormal: activeNewTenants,
        churnWarning: churnWarningCount,
        dailyTrend,
      },
      renewalRisks: renewalRiskTenants.map((tenant) => ({
        tenantName: tenant.name,
        dueInDays: resolveDueInDays(tenant.serviceExpireAt),
        owner: tenant.adminName?.trim() || '待分配',
      })),
    };
  }

  // 构建租户健康度视图，服务到期风险仅由 serviceExpireAt 派生
  private async buildTenantHealthItems(): Promise<TenantHealthItem[]> {
    const activeSince = dayjs().subtract(ACTIVE_USER_WINDOW_DAYS, 'day').startOf('day').toDate();

    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        adminName: true,
        status: true,
        freezeReason: true,
        rejectReason: true,
        serviceExpireAt: true,
        createdAt: true,
        users: {
          where: { deletedAt: null },
          select: {
            loginAt: true,
          },
        },
      },
    });

    return tenants
      .map((tenant) => {
        const totalUsers = tenant.users.length;
        const activeUsers = tenant.users.filter((user) => user.loginAt && dayjs(user.loginAt).isAfter(activeSince)).length;
        const dueInDays = resolveDueInDays(tenant.serviceExpireAt);
        const tenantStatus = fromPrismaTenantStatus(tenant.status);
        const health = resolveTenantHealthScore(tenantStatus, activeUsers, totalUsers, dueInDays);

        return {
          tenant: tenant.name,
          health,
          userCoverage: resolveUserCoverage(activeUsers, totalUsers),
          exception: resolveTenantException({
            status: tenantStatus,
            dueInDays,
            freezeReason: tenant.freezeReason,
            rejectReason: tenant.rejectReason,
            activeUsers,
            totalUsers,
          }),
          owner: tenant.adminName?.trim() || '待分配',
          _createdAt: dayjs(tenant.createdAt).valueOf(),
        };
      })
      .sort((a, b) => {
        if (a.health !== b.health) {
          return a.health - b.health;
        }
        return b._createdAt - a._createdAt;
      })
      .map(({ _createdAt, ...item }) => item);
  }
}
