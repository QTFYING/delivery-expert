import {
  OfflinePaymentVerifyStatusEnum,
  OfflinePaymentMethodEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentOrderStatusEnum,
  type OfflinePaymentVerifyStatus,
  type OfflinePaymentMethod,
  type OrderStatus,
  type PaymentChannel,
  type PaymentMethod,
  type PaymentOrderStatus,
} from '@shou/types/enums';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';

export const PAYMENT_PAYING_EXPIRE_MINUTES = 5;

export type OnlinePaymentSettlementDecision = { allowed: true } | { allowed: false; reason: string };
export type PaymentOrderTransitionCode = 'INVALID_STATUS' | 'INVALID_METHOD' | 'ORDER_CLOSED' | 'ORDER_PAID' | 'INVALID_AMOUNT' | 'AMOUNT_MISMATCH';
export type PaymentOrderTransitionDecision<TData> =
  | { allowed: true; data: TData }
  | { allowed: false; code: PaymentOrderTransitionCode; reason: string };

type MoneyValue = { toString(): string };

export type PaymentOrderAggregateSnapshot = {
  status: OrderStatus;
  voided: boolean;
  totalAmount: MoneyValue;
  paid: MoneyValue;
};

export type PaymentOrderTransitionSnapshot = {
  status: PaymentOrderStatus;
  paymentMethod: PaymentMethod | null;
};

export type PaymentOrderUpdateData = {
  status?: PaymentOrderStatus;
  paymentMethod?: PaymentMethod;
  channel?: PaymentChannel;
  statusMessage?: string;
  lastInitiatedAt?: Date;
  cashierUrl?: string | null;
  cashierExpiresAt?: Date | null;
  paidAt?: Date;
  offlineVerifyStatus?: OfflinePaymentVerifyStatus;
  offlineVerifiedAt?: Date;
};

/**
 * 判断一笔处于 paying 的支付单是否已经超过支付确认窗口
 *
 * 这里只负责基于支付单状态和最后一次发起时间做纯领域判断
 * 不负责写库，不负责决定前端最终展示状态
 */
export function shouldExpirePayingPaymentOrder(
  paymentOrder: {
    status: PaymentOrderStatus;
    lastInitiatedAt: Date | null;
    cashierExpiresAt?: Date | null;
  } | null,
  now: Date = new Date(),
): boolean {
  if (!paymentOrder || paymentOrder.status !== PaymentOrderStatusEnum.PAYING) {
    return false;
  }

  if (paymentOrder.cashierExpiresAt) {
    return !dayjs(paymentOrder.cashierExpiresAt).isAfter(now);
  }

  return Boolean(paymentOrder.lastInitiatedAt && dayjs(now).diff(dayjs(paymentOrder.lastInitiatedAt), 'minute') >= PAYMENT_PAYING_EXPIRE_MINUTES);
}

/**
 * 将订单聚合状态和最新支付单状态合成为 H5 页面应展示的支付状态
 *
 * 返回值面向 H5 对外语义，不等于 payment_orders.status 的直接透传
 * 订单已作废、已结清等更高优先级事实会先覆盖单笔支付单状态
 */
export function resolvePaymentOrderStatus(
  order: PaymentOrderAggregateSnapshot,
  paymentOrder: {
    status: PaymentOrderStatus;
  } | null,
): PaymentOrderStatus {
  const amountDecimal = new Decimal(order.totalAmount.toString());
  const paidDecimal = new Decimal(order.paid.toString());

  if (isOrderClosed(order)) {
    return PaymentOrderStatusEnum.EXPIRED;
  }
  if (paidDecimal.gte(amountDecimal) || order.status === OrderStatusEnum.PAID) {
    return PaymentOrderStatusEnum.PAID;
  }
  if (!paymentOrder) {
    return PaymentOrderStatusEnum.UNPAID;
  }

  switch (paymentOrder.status) {
    case PaymentOrderStatusEnum.PAYING:
      return PaymentOrderStatusEnum.PAYING;
    case PaymentOrderStatusEnum.PENDING_VERIFICATION:
      return PaymentOrderStatusEnum.PENDING_VERIFICATION;
    case PaymentOrderStatusEnum.PAID:
      return PaymentOrderStatusEnum.PAID;
    case PaymentOrderStatusEnum.EXPIRED:
      return PaymentOrderStatusEnum.EXPIRED;
    case PaymentOrderStatusEnum.UNPAID:
    default:
      return PaymentOrderStatusEnum.UNPAID;
  }
}

/**
 * 判断当前在线支付成功回调是否仍允许把这笔 paymentOrder 结算入账
 *
 * 这条规则只服务于在线支付结算收口
 * 只有仍处于 paying、属于 online 且金额仍与订单当前待支付金额一致的支付尝试才允许成功入账
 */
export function resolveOnlinePaymentSettlementDecision(
  order: PaymentOrderAggregateSnapshot,
  paymentOrder: {
    status: PaymentOrderStatus;
    paymentMethod: PaymentMethod | null;
    amount: MoneyValue;
  },
): OnlinePaymentSettlementDecision {
  if (paymentOrder.paymentMethod !== PaymentMethodEnum.ONLINE) {
    return { allowed: false, reason: 'paymentOrder 不是 online 支付单' };
  }

  if (paymentOrder.status !== PaymentOrderStatusEnum.PAYING) {
    return {
      allowed: false,
      reason: `当前状态 ${paymentOrder.status} 不允许在线成功回调结算`,
    };
  }

  if (isOrderClosed(order)) {
    return { allowed: false, reason: '订单已作废或过期' };
  }

  const totalAmount = new Decimal(order.totalAmount.toString());
  const paidAmount = new Decimal(order.paid.toString());
  if (paidAmount.gte(totalAmount) || order.status === OrderStatusEnum.PAID) {
    return { allowed: false, reason: '订单已结清' };
  }

  const payableAmount = totalAmount.minus(paidAmount);
  if (payableAmount.lte(0)) {
    return { allowed: false, reason: '订单当前待支付金额不能为 0' };
  }

  const paymentOrderAmount = new Decimal(paymentOrder.amount.toString());
  if (!paymentOrderAmount.equals(payableAmount)) {
    return {
      allowed: false,
      reason: `金额 ${paymentOrderAmount.toFixed(2)} 与订单当前待支付金额 ${payableAmount.toFixed(2)} 不一致`,
    };
  }

  return { allowed: true };
}

// 激活在线支付尝试，只允许 ONLINE 支付单从 UNPAID 进入 PAYING
export function buildActivateOnlinePaymentAttemptTransition(
  paymentOrder: PaymentOrderTransitionSnapshot,
  now: Date,
  cashier: { url: string; expiresAt: Date },
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (paymentOrder.paymentMethod !== PaymentMethodEnum.ONLINE) {
    return { allowed: false, code: 'INVALID_METHOD', reason: '支付单不是 online 支付单' };
  }
  if (paymentOrder.status !== PaymentOrderStatusEnum.UNPAID) {
    return { allowed: false, code: 'INVALID_STATUS', reason: `当前状态 ${paymentOrder.status} 不允许激活在线支付` };
  }

  return {
    allowed: true,
    data: {
      status: PaymentOrderStatusEnum.PAYING,
      statusMessage: '支付确认中',
      lastInitiatedAt: now,
      cashierUrl: cashier.url,
      cashierExpiresAt: cashier.expiresAt,
    },
  };
}

// 建单失败时仅允许回写 UNPAID 占位单文案，不把未确认的第三方请求暴露成 PAYING
export function buildGatewayCreateFailedTransition(
  paymentOrder: { status: PaymentOrderStatus },
  statusMessage: string,
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (paymentOrder.status !== PaymentOrderStatusEnum.UNPAID) {
    return { allowed: false, code: 'INVALID_STATUS', reason: `当前状态 ${paymentOrder.status} 不允许标记建单失败` };
  }

  return { allowed: true, data: { statusMessage } };
}

// 网关失败回调只允许 ONLINE 支付单从 PAYING 进入 EXPIRED
export function buildGatewayPaymentFailedTransition(
  paymentOrder: PaymentOrderTransitionSnapshot,
  failureMessage?: string,
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (paymentOrder.paymentMethod !== PaymentMethodEnum.ONLINE) {
    return { allowed: false, code: 'INVALID_METHOD', reason: '支付单不是 online 支付单' };
  }
  if (paymentOrder.status !== PaymentOrderStatusEnum.PAYING) {
    return { allowed: false, code: 'INVALID_STATUS', reason: `当前状态 ${paymentOrder.status} 不允许处理网关失败回调` };
  }

  return {
    allowed: true,
    data: {
      status: PaymentOrderStatusEnum.EXPIRED,
      statusMessage: failureMessage || '支付未完成，请重新发起',
    },
  };
}

// 网关成功回调只允许仍满足结算规则的 ONLINE 支付单从 PAYING 进入 PAID
export function buildGatewayPaymentSucceededTransition(
  order: PaymentOrderAggregateSnapshot,
  paymentOrder: PaymentOrderTransitionSnapshot & {
    amount: MoneyValue;
  },
  input: {
    channel: PaymentChannel;
    amount: Decimal;
    paidAt: Date;
  },
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  const settlementDecision = resolveOnlinePaymentSettlementDecision(order, paymentOrder);
  if (!settlementDecision.allowed) {
    if (isOrderClosed(order)) {
      return { allowed: false, code: 'ORDER_CLOSED', reason: settlementDecision.reason };
    }
    if (new Decimal(order.paid.toString()).gte(new Decimal(order.totalAmount.toString())) || order.status === OrderStatusEnum.PAID) {
      return { allowed: false, code: 'ORDER_PAID', reason: settlementDecision.reason };
    }
    if (paymentOrder.paymentMethod !== PaymentMethodEnum.ONLINE) {
      return { allowed: false, code: 'INVALID_METHOD', reason: settlementDecision.reason };
    }
    return { allowed: false, code: 'INVALID_STATUS', reason: settlementDecision.reason };
  }

  const paymentOrderAmount = new Decimal(paymentOrder.amount.toString());
  if (!input.amount.equals(paymentOrderAmount)) {
    return {
      allowed: false,
      code: 'AMOUNT_MISMATCH',
      reason: `网关金额 ${input.amount.toFixed(2)} 与支付单金额 ${paymentOrderAmount.toFixed(2)} 不一致`,
    };
  }

  return {
    allowed: true,
    data: {
      status: PaymentOrderStatusEnum.PAID,
      channel: input.channel,
      statusMessage: '支付成功',
      paidAt: input.paidAt,
    },
  };
}

function isOrderClosed(order: Pick<PaymentOrderAggregateSnapshot, 'status' | 'voided'>): boolean {
  return order.voided || order.status === OrderStatusEnum.EXPIRED || order.status === OrderStatusEnum.VOIDED;
}

// H5 线下支付登记的支付单初始状态，由线下方式闭集统一推导
export function buildOfflinePaymentSubmittedTransition(
  paymentMethod: OfflinePaymentMethod,
  _now: Date,
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (paymentMethod === OfflinePaymentMethodEnum.CASH) {
    return {
      allowed: true,
      data: {
        status: PaymentOrderStatusEnum.PENDING_VERIFICATION,
        paymentMethod: PaymentMethodEnum.CASH,
        statusMessage: '线下登记待确认',
        offlineVerifyStatus: OfflinePaymentVerifyStatusEnum.PENDING,
      },
    };
  }

  if (paymentMethod === OfflinePaymentMethodEnum.OTHER_PAID) {
    return {
      allowed: true,
      data: {
        status: PaymentOrderStatusEnum.PENDING_VERIFICATION,
        paymentMethod: PaymentMethodEnum.OTHER_PAID,
        statusMessage: '线下付款备注待确认',
        offlineVerifyStatus: OfflinePaymentVerifyStatusEnum.PENDING,
      },
    };
  }

  return { allowed: false, code: 'INVALID_METHOD', reason: 'paymentMethod 不是合法值' };
}

// 财务确认只允许线下待确认支付单进入 PAID
export function buildOfflinePaymentVerifiedTransition(
  paymentOrder: PaymentOrderTransitionSnapshot,
  verifiedAt: Date,
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (paymentOrder.paymentMethod !== PaymentMethodEnum.CASH && paymentOrder.paymentMethod !== PaymentMethodEnum.OTHER_PAID) {
    return { allowed: false, code: 'INVALID_METHOD', reason: '支付单不是线下登记支付单' };
  }
  if (paymentOrder.status !== PaymentOrderStatusEnum.PENDING_VERIFICATION) {
    return { allowed: false, code: 'INVALID_STATUS', reason: `当前状态 ${paymentOrder.status} 不允许线下确认` };
  }

  return {
    allowed: true,
    data: {
      status: PaymentOrderStatusEnum.PAID,
      statusMessage: '线下登记已确认',
      offlineVerifyStatus: OfflinePaymentVerifyStatusEnum.VERIFIED,
      offlineVerifiedAt: verifiedAt,
      paidAt: verifiedAt,
    },
  };
}

// 支付确认窗口超时后，统一把 PAYING 支付单转为 EXPIRED
export function buildExpirePayingPaymentOrderTransition(
  paymentOrder: {
    status: PaymentOrderStatus;
    lastInitiatedAt: Date | null;
    cashierExpiresAt?: Date | null;
  },
  now: Date = new Date(),
): PaymentOrderTransitionDecision<PaymentOrderUpdateData> {
  if (!shouldExpirePayingPaymentOrder(paymentOrder, now)) {
    return { allowed: false, code: 'INVALID_STATUS', reason: '支付单未达到过期条件' };
  }

  return {
    allowed: true,
    data: {
      status: PaymentOrderStatusEnum.EXPIRED,
      statusMessage: '支付超时，请重新发起',
    },
  };
}
