import type { EnumValue } from './common';

/**
 * 租户侧对账核销状态
 */
export const FinanceReconciliationStatusEnum = {
  /** 已核销 */
  VERIFIED: 'verified',
  /** 待核销 */
  PENDING: 'pending',
  /** 异常 */
  EXCEPTION: 'exception',
} as const;

export type FinanceReconciliationStatus = EnumValue<typeof FinanceReconciliationStatusEnum>;

/**
 * 平台对账日报状态
 */
export const AdminReconciliationStatusEnum = {
  /** 对账中 */
  RECONCILING: 'reconciling',
  /** 已核销 */
  VERIFIED: 'verified',
  /** 部分未核 */
  PARTIAL_UNVERIFIED: 'partial_unverified',
  /** 逾期未收 */
  OVERDUE_UNPAID: 'overdue_unpaid',
} as const;

export type AdminReconciliationStatus = EnumValue<typeof AdminReconciliationStatusEnum>;
