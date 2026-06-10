import { OrderPayTypeEnum, OrderStatusEnum, type OrderPayType, type OrderStatus } from '@shou/types/enums';

// 订单收款状态中文文案，用于导出等需要面向人阅读的场景
const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  [OrderStatusEnum.PENDING]: '待收款',
  [OrderStatusEnum.PARTIAL]: '部分收款',
  [OrderStatusEnum.PAID]: '已结清',
  [OrderStatusEnum.EXPIRED]: '已过期',
  [OrderStatusEnum.VOIDED]: '已作废',
};

const PAY_TYPE_TEXT: Record<OrderPayType, string> = {
  [OrderPayTypeEnum.CASH]: '现款',
  [OrderPayTypeEnum.CREDIT]: '账期',
};

export function orderStatusText(status: OrderStatus): string {
  return ORDER_STATUS_TEXT[status] ?? status;
}

export function payTypeText(payType: OrderPayType): string {
  return PAY_TYPE_TEXT[payType] ?? payType;
}
