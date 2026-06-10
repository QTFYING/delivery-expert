import type { EnumValue } from './common';

/**
 * 订单收款状态
 */
export const OrderStatusEnum = {
  /** 待收款 */
  PENDING: 'pending',
  /** 部分收款 */
  PARTIAL: 'partial',
  /** 已结清 */
  PAID: 'paid',
  /** 已过期 */
  EXPIRED: 'expired',
  /** 已作废 */
  VOIDED: 'voided',
} as const;

export type OrderStatus = EnumValue<typeof OrderStatusEnum>;

/**
 * 订单列表本期开放搜索状态
 */
export const OrderSearchStatusEnum = {
  /** 待收款，未结清且未过期 */
  PENDING: OrderStatusEnum.PENDING,
  /** 已收款 */
  PAID: OrderStatusEnum.PAID,
  /** 已过期 */
  EXPIRED: OrderStatusEnum.EXPIRED,
} as const;

export type OrderSearchStatus = EnumValue<typeof OrderSearchStatusEnum>;

/**
 * 订单付款类型
 */
export const OrderPayTypeEnum = {
  /** 现款 */
  CASH: 'cash',
  /** 账期 */
  CREDIT: 'credit',
} as const;

export type OrderPayType = EnumValue<typeof OrderPayTypeEnum>;

/**
 * 账期子类型
 */
export const CreditTypeEnum = {
  /** 月结 */
  MONTH: 'month',
  /** 周结 */
  WEEK: 'week',
  /** 普通账期 */
  PERIOD: 'period',
} as const;

export type CreditType = EnumValue<typeof CreditTypeEnum>;

/**
 * 打印事件结果
 */
export const PrintRecordResultEnum = {
  /** 打印成功 */
  SUCCESS: 'success',
  /** 打印失败 */
  FAILED: 'failed',
} as const;

export type PrintRecordResult = EnumValue<typeof PrintRecordResultEnum>;

/**
 * 导入任务状态
 */
export const OrderImportJobStatusEnum = {
  /** 待处理 */
  PENDING: 'pending',
  /** 处理中 */
  PROCESSING: 'processing',
  /** 已完成 */
  COMPLETED: 'completed',
  /** 已失败 */
  FAILED: 'failed',
} as const;

export type OrderImportJobStatus = EnumValue<typeof OrderImportJobStatusEnum>;

/**
 * 导入冲突处理策略
 */
export const OrderImportConflictPolicyEnum = {
  /** 跳过已有订单 */
  SKIP: 'skip',
  /** 覆盖已有订单 */
  OVERWRITE: 'overwrite',
} as const;

export type OrderImportConflictPolicy = EnumValue<typeof OrderImportConflictPolicyEnum>;

/**
 * 导入模板字段来源
 */
export const OrderImportTemplateFieldSourceTypeEnum = {
  /** 订单头 / 列表行字段 */
  LIST: 'list',
  /** 订单明细行字段 */
  LINE: 'line',
} as const;

export type OrderImportTemplateFieldSourceType = EnumValue<typeof OrderImportTemplateFieldSourceTypeEnum>;

/**
 * 导入模板字段类型
 */
export const OrderTemplateFieldTypeEnum = {
  /** 文本 */
  TEXT: 'text',
  /** 数字 */
  NUMBER: 'number',
  /** 金额 */
  MONEY: 'money',
  /** 日期 */
  DATE: 'date',
  /** 枚举 */
  ENUM: 'enum',
} as const;

export type OrderTemplateFieldType = EnumValue<typeof OrderTemplateFieldTypeEnum>;

/**
 * 账期提醒状态
 */
export const CreditOrderStatusEnum = {
  /** 正常 */
  NORMAL: 'normal',
  /** 即将到期 */
  SOON: 'soon',
  /** 今日到期 */
  TODAY: 'today',
  /** 已逾期 */
  OVERDUE: 'overdue',
} as const;

export type CreditOrderStatus = EnumValue<typeof CreditOrderStatusEnum>;

/**
 * 打印中心订单打印状态筛选
 */
export const PrintingOrderPrintStatusEnum = {
  /** 全部 */
  ALL: 'all',
  /** 未打印 */
  UNPRINTED: 'unprinted',
  /** 已打印 */
  PRINTED: 'printed',
} as const;

export type PrintingOrderPrintStatus = EnumValue<typeof PrintingOrderPrintStatusEnum>;
