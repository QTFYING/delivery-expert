import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetTypeEnum,
  PaymentRecordStatusEnum,
  TenantCertificationStatusEnum as PrismaTenantCertificationStatusEnum,
  TenantStatusEnum as PrismaTenantStatusEnum,
  UserStatusEnum as PrismaUserStatusEnum,
} from '@prisma/client';
import type { ConsoleInfoResponse, DashboardMetricItem, LoginRiskEventItem, PlatformTodoItem } from '@shou/types/contracts';
import { UserStatusEnum } from '@shou/types/enums';
import dayjs from 'dayjs';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaUserStatus } from '../tenant/mapping/tenant.mapper';
import { formatAmount, resolveAuditRiskLevel, toMoney } from './mapping/platform.mapper';
import { ensurePlatformScope } from './platform.scope';

const PLATFORM_PRODUCT_NAME = '收单吧';
const PLATFORM_SUITE_NAME = '平台运营后台';
const PLATFORM_SCOPE_LABEL = '平台视角';
const PLATFORM_TENANT_LABEL = '—';
const TODO_RENEWAL_WINDOW_DAYS = 7;

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取平台控制台上下文，限定平台登录态访问。
  async getConsoleInfo(currentUser: JwtPayload): Promise<ConsoleInfoResponse> {
    ensurePlatformScope(currentUser);

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        account: true,
        realName: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('当前用户不存在');
    }

    return {
      productName: PLATFORM_PRODUCT_NAME,
      suiteName: PLATFORM_SUITE_NAME,
      scopeLabel: PLATFORM_SCOPE_LABEL,
      operator: user.realName || user.account,
      role: user.role,
      currentTenant: PLATFORM_TENANT_LABEL,
    };
  }

  // 统计平台核心指标，服务到期风险按 serviceExpireAt 时间窗口计算。
  async getMetrics(currentUser: JwtPayload): Promise<DashboardMetricItem[]> {
    ensurePlatformScope(currentUser);

    const todayStart = dayjs().startOf('day').toDate();
    const monthStart = dayjs().startOf('month').toDate();
    const renewalDeadline = dayjs().add(TODO_RENEWAL_WINDOW_DAYS, 'day').endOf('day').toDate();

    const [
      totalTenants,
      activeTenants,
      onboardingTenants,
      monthFlowAggregate,
      totalFlowAggregate,
      newTenantsThisMonth,
      pendingCertificationCount,
      renewalRiskCount,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { deletedAt: null } }),
      this.prisma.tenant.count({
        where: { deletedAt: null, status: PrismaTenantStatusEnum.ACTIVE },
      }),
      this.prisma.tenant.count({
        where: { deletedAt: null, status: PrismaTenantStatusEnum.ONBOARDING },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentRecordStatusEnum.SUCCESS,
          paidAt: { gte: monthStart },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentRecordStatusEnum.SUCCESS,
        },
      }),
      this.prisma.tenant.count({
        where: { deletedAt: null, createdAt: { gte: monthStart } },
      }),
      this.prisma.tenantCertification.count({
        where: {
          status: {
            in: [
              PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
              PrismaTenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
              PrismaTenantCertificationStatusEnum.PENDING_CONFIRMATION,
            ],
          },
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          serviceExpireAt: {
            gte: todayStart,
            lte: renewalDeadline,
          },
        },
      }),
    ]);

    const monthFlow = toMoney(monthFlowAggregate._sum.amount);
    const totalFlow = toMoney(totalFlowAggregate._sum.amount);
    const riskAlerts = pendingCertificationCount + renewalRiskCount;

    return [
      {
        label: '租户总数',
        value: `${totalTenants} 家`,
        helper: `活跃 ${activeTenants} 家，待上线 ${onboardingTenants} 家`,
        tone: 'blue',
      },
      {
        label: '平台总流水',
        value: `${formatAmount(totalFlow)} 元`,
        helper: `本月实收 ${formatAmount(monthFlow)} 元`,
        tone: 'emerald',
      },
      {
        label: '本月新增租户',
        value: `${newTenantsThisMonth} 家`,
        helper: '统计自然月内新建租户数量',
        tone: 'amber',
      },
      {
        label: '风险预警',
        value: `${riskAlerts} 条`,
        helper: `待审核 ${pendingCertificationCount} 条，近 ${TODO_RENEWAL_WINDOW_DAYS} 天到期 ${renewalRiskCount} 家`,
        tone: 'rose',
      },
    ];
  }

  // 汇总平台待办事项，续费待办只读取服务到期事实字段。
  async getTodos(currentUser: JwtPayload): Promise<PlatformTodoItem[]> {
    ensurePlatformScope(currentUser);

    const todayStart = dayjs().startOf('day').toDate();
    const renewalDeadline = dayjs().add(TODO_RENEWAL_WINDOW_DAYS, 'day').endOf('day').toDate();

    const [pendingCertificationCount, onboardingTenantCount, renewalRiskCount, pausedTenantCount] = await Promise.all([
      this.prisma.tenantCertification.count({
        where: {
          status: {
            in: [
              PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
              PrismaTenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
              PrismaTenantCertificationStatusEnum.PENDING_CONFIRMATION,
            ],
          },
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          status: PrismaTenantStatusEnum.ONBOARDING,
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          serviceExpireAt: {
            gte: todayStart,
            lte: renewalDeadline,
          },
        },
      }),
      this.prisma.tenant.count({
        where: {
          deletedAt: null,
          status: PrismaTenantStatusEnum.PAUSED,
        },
      }),
    ]);

    const todos: PlatformTodoItem[] = [];

    if (pendingCertificationCount > 0) {
      todos.push({
        title: `资质审核待处理 ${pendingCertificationCount} 条`,
        detail: '存在待初审、待复核或待确认的资质申请，需尽快完成审核流转。',
        owner: '平台审核',
        priority: '高',
      });
    }

    if (renewalRiskCount > 0) {
      todos.push({
        title: `近 ${TODO_RENEWAL_WINDOW_DAYS} 天到期租户 ${renewalRiskCount} 家`,
        detail: '请跟进续费进度，避免到期后影响租户正常运营。',
        owner: '商务运营',
        priority: '高',
      });
    }

    if (onboardingTenantCount > 0) {
      todos.push({
        title: `待上线租户 ${onboardingTenantCount} 家`,
        detail: '租户仍处于上线准备阶段，需要继续跟进初始化配置与培训。',
        owner: '客户成功',
        priority: '中',
      });
    }

    if (pausedTenantCount > 0) {
      todos.push({
        title: `冻结租户 ${pausedTenantCount} 家`,
        detail: '请确认冻结原因是否已解除，并判断是否需要恢复服务。',
        owner: '平台运营',
        priority: '中',
      });
    }

    if (todos.length === 0) {
      todos.push({
        title: '平台运营稳定',
        detail: '当前没有需要立即处理的高优先级事项。',
        owner: '平台运营',
        priority: '低',
      });
    }

    return todos;
  }

  // 获取账号相关风险事件，供平台运营侧巡检使用。
  async getRiskEvents(currentUser: JwtPayload): Promise<LoginRiskEventItem[]> {
    ensurePlatformScope(currentUser);

    const [lockedUsers, accountAuditLogs] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          status: {
            in: [PrismaUserStatusEnum.LOCKED, PrismaUserStatusEnum.DISABLED],
          },
        },
        include: {
          tenant: {
            select: { name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: {
          targetType: AuditTargetTypeEnum.ACCOUNT,
        },
        include: {
          tenant: {
            select: { name: true },
          },
        },
        orderBy: { time: 'desc' },
        take: 10,
      }),
    ]);

    const userEvents = lockedUsers.map((user) => {
      const status = fromPrismaUserStatus(user.status);
      return {
        account: user.account,
        tenant: user.tenant?.name ?? '平台',
        event: status === UserStatusEnum.LOCKED ? '账号处于锁定状态' : '账号已被停用',
        time: formatDateTime(user.updatedAt),
        level: status === UserStatusEnum.LOCKED ? '高' : '中',
      };
    });

    const auditEvents = accountAuditLogs.map((log) => ({
      account: log.target,
      tenant: log.tenant?.name ?? '平台',
      event: log.action,
      time: formatDateTime(log.time),
      level: resolveAuditRiskLevel(log.action),
    }));

    return [...userEvents, ...auditEvents].sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf()).slice(0, 10);
  }
}
