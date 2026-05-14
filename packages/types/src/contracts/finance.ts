import type { ListParams } from '../common';
import type { AdminReconciliationStatus, FinanceReconciliationStatus } from '../enums';

export type FinanceReconciliationQuery = ListParams;

export interface FinanceSummaryResponse {
  /** 应收总额，单位元 */
  totalReceivable: number;
  /** 已收总额，单位元 */
  totalReceived: number;
  /** 手续费总额，单位元 */
  totalFee: number;
  /** 到账总额，单位元 */
  totalNet: number;
  /** 回款率 */
  collectionRate: number;
  /** 账期订单数 */
  creditOrderCount: number;
  /** 订单总数 */
  orderCount: number;
}

export interface FinanceReconciliationRecordItem {
  /** 订单号 */
  orderId: string;
  /** 客户名称 */
  customer: string;
  /** 收款金额，单位元 */
  amount: number;
  /** 到账金额，单位元 */
  net: number;
  /** 手续费，单位元 */
  fee: number;
  /** 收款通道 */
  channel: string;
  /** 收款时间 */
  paidAt: string;
  /** 对账状态 */
  status: FinanceReconciliationStatus;
}

export interface AdminReconciliationSummaryResponse {
  /** 应收总额，单位元 */
  totalReceivable: number;
  /** 已收总额，单位元 */
  totalReceived: number;
  /** 待收总额，单位元 */
  totalPending: number;
  /** 逾期未收总额，单位元 */
  totalOverdue: number;
  /** 对账进度百分比 */
  progressPercent: number;
}

export type AdminReconciliationDailyQuery = ListParams;

export interface AdminReconciliationDailyRecordItem {
  /** 对账日期 */
  date: string;
  /** 租户名称 */
  tenant: string;
  /** 订单数 */
  orders: number;
  /** 应收金额，单位元 */
  amount: number;
  /** 已收金额，单位元 */
  received: number;
  /** 待收金额，单位元 */
  pending: number;
  /** 平台侧对账状态 */
  status: AdminReconciliationStatus;
}
