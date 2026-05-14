import { Prisma } from '@prisma/client';
import { TenantStatusEnum, type TenantStatus } from '@shou/types/enums';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';

export const ACTIVE_USER_WINDOW_DAYS = 30;

const TENANT_HEALTH_BASE_SCORE: Record<TenantStatus, number> = {
  [TenantStatusEnum.PAUSED]: 35,
  [TenantStatusEnum.ATTENTION]: 55,
  [TenantStatusEnum.ONBOARDING]: 68,
  [TenantStatusEnum.ACTIVE]: 82,
};

export function resolveTenantHealthScore(status: TenantStatus, activeUsers: number, totalUsers: number, dueInDays: number): number {
  const baseScore = TENANT_HEALTH_BASE_SCORE[status] ?? TENANT_HEALTH_BASE_SCORE[TenantStatusEnum.ACTIVE];
  const coverageBonus = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 12) : 0;
  const duePenalty = dueInDays <= 7 ? 15 : dueInDays <= 30 ? 6 : 0;
  const idlePenalty = totalUsers > 0 && activeUsers === 0 ? 8 : 0;
  const rawScore = baseScore + coverageBonus - duePenalty - idlePenalty;

  return Math.min(100, Math.max(0, rawScore));
}

export function resolveTenantException(input: {
  status: TenantStatus;
  dueInDays: number;
  freezeReason: string | null;
  rejectReason: string | null;
  activeUsers: number;
  totalUsers: number;
}): string {
  if (input.status === TenantStatusEnum.PAUSED) {
    return input.freezeReason?.trim() || '租户已冻结';
  }

  if (input.status === TenantStatusEnum.ATTENTION) {
    return input.rejectReason?.trim() || '存在待处理风险';
  }

  if (input.status === TenantStatusEnum.ONBOARDING) {
    return '待完成上线准备';
  }

  if (input.dueInDays <= 7) {
    return `距离到期 ${input.dueInDays} 天`;
  }

  if (input.totalUsers > 0 && input.activeUsers === 0) {
    return `近 ${ACTIVE_USER_WINDOW_DAYS} 天暂无活跃账号`;
  }

  return '运行稳定';
}

export function resolveUserCoverage(activeUsers: number, totalUsers: number): string {
  if (totalUsers === 0) {
    return '0/0 已开通';
  }

  return `${activeUsers}/${totalUsers} 近${ACTIVE_USER_WINDOW_DAYS}天活跃`;
}

export function resolveAuditRiskLevel(action: string): string {
  if (action.includes('删除') || action.includes('冻结') || action.includes('停用')) {
    return '高';
  }

  if (action.includes('重置') || action.includes('修改密码') || action.includes('锁定')) {
    return '中';
  }

  return '低';
}

export function resolveDueInDays(serviceExpireAt: Date | null): number {
  if (!serviceExpireAt) {
    return 0;
  }

  return Math.max(dayjs(serviceExpireAt).endOf('day').diff(dayjs().startOf('day'), 'day'), 0);
}

export function toMoney(value: Prisma.Decimal | Decimal | null | undefined): number {
  if (!value) {
    return 0;
  }

  return Number(new Decimal(value.toString()).toFixed(2));
}

export function formatAmount(amount: number): string {
  return new Decimal(amount).toFixed(2);
}
