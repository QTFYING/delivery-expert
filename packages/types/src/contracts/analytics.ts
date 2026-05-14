export interface DailyTrendItem {
  /** 日期 */
  day: string;
  /** 当日应收金额 单位元 */
  receivableAmount: number;
  /** 当日已收金额 单位元 */
  receivedAmount: number;
}

export interface MonthlyTrendItem {
  /** 月份 */
  month: string;
  /** 当月应收金额 单位元 */
  receivableAmount: number;
  /** 当月已收金额 单位元 */
  receivedAmount: number;
}

export interface LiveFeedEntryItem {
  /** 动态时间 */
  time: string;
  /** 客户名称 */
  customer: string;
  /** 收款金额 单位元 */
  amount: number;
  /** 展示状态 */
  status: string;
}

export interface AnalyticsDashboardResponse {
  /** 今日应收金额 单位元 */
  todayReceivable: number;
  /** 今日已收金额 单位元 */
  todayReceived: number;
  /** 今日待收金额 单位元 */
  todayPending: number;
  /** 今日回款率 */
  collectionRate: number;
  /** 待打印数量 */
  pendingPrintCount: number;
  /** 即将到期账期订单数 */
  creditDueSoonCount: number;
  /** 部分付款订单数 */
  partialPaymentCount: number;
  /** 角色定制标题 */
  roleTitle: string;
}
