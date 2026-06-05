import type { EnumValue } from './common';

/**
 * 支付方式
 */
export const PaymentMethodEnum = {
  /** 在线支付 */
  ONLINE: 'online',
  /** 现金支付 */
  CASH: 'cash',
  /** 其他方式已支付 */
  OTHER_PAID: 'other_paid',
} as const;

export type PaymentMethod = EnumValue<typeof PaymentMethodEnum>;

/**
 * 线下支付方式
 */
export const OfflinePaymentMethodEnum = {
  /** 现金支付 */
  CASH: 'cash',
  /** 其他方式已支付 */
  OTHER_PAID: 'other_paid',
} as const;

export type OfflinePaymentMethod = EnumValue<typeof OfflinePaymentMethodEnum>;

/**
 * 支付通道
 */
export const PaymentChannelEnum = {
  /** 拉卡拉 */
  LAKALA: 'lakala',
  /** 收钱吧 */
  SHOUQIANBA: 'shouqianba',
  /** 平安银行 */
  PINGAN_BANK: 'pingan_bank',
} as const;

export type PaymentChannel = EnumValue<typeof PaymentChannelEnum>;

/**
 * H5 支付单状态
 */
export const PaymentOrderStatusEnum = {
  /** 待支付 */
  UNPAID: 'unpaid',
  /** 支付中 */
  PAYING: 'paying',
  /** 待确认 */
  PENDING_VERIFICATION: 'pending_verification',
  /** 已完成 */
  PAID: 'paid',
  /** 已过期 */
  EXPIRED: 'expired',
} as const;

export type PaymentOrderStatus = EnumValue<typeof PaymentOrderStatusEnum>;

/**
 * 线下登记确认状态
 */
export const OfflinePaymentVerifyStatusEnum = {
  /** 待确认 */
  PENDING: 'pending',
  /** 已确认 */
  VERIFIED: 'verified',
} as const;

export type OfflinePaymentVerifyStatus = EnumValue<typeof OfflinePaymentVerifyStatusEnum>;

/**
 * 支付流水状态
 */
export const PaymentRecordStatusEnum = {
  /** 成功 */
  SUCCESS: 'success',
  /** 部分完成 */
  PARTIAL: 'partial',
  /** 处理中 */
  PENDING: 'pending',
  /** 失败 */
  FAILED: 'failed',
} as const;

export type PaymentRecordStatus = EnumValue<typeof PaymentRecordStatusEnum>;
