import {
  CashVerifyStatusEnum as PrismaCashVerifyStatusEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
} from '@prisma/client';

import {
  CashVerifyStatusEnum,
  OrderPayTypeEnum,
  OrderStatusEnum,
  PaymentChannelEnum,
  PaymentMethodEnum,
  PaymentOrderStatusEnum,
  PaymentRecordStatusEnum,
  type CashVerifyStatus,
  type OrderPayType,
  type OrderStatus,
  type PaymentChannel,
  type PaymentMethod,
  type PaymentOrderStatus,
  type PaymentRecordStatus,
} from '@shou/types/enums';

import type { PaymentOrderAggregateSnapshot, PaymentOrderTransitionSnapshot, PaymentOrderUpdateData } from '../payment.domain';

type MoneyValue = { toString(): string };

const PRISMA_TO_PAYMENT_METHOD: Record<PrismaPaymentMethodEnum, PaymentMethod> = {
  [PrismaPaymentMethodEnum.ONLINE]: PaymentMethodEnum.ONLINE,
  [PrismaPaymentMethodEnum.CASH]: PaymentMethodEnum.CASH,
  [PrismaPaymentMethodEnum.OTHER_PAID]: PaymentMethodEnum.OTHER_PAID,
};

const PAYMENT_METHOD_TO_PRISMA: Record<PaymentMethod, PrismaPaymentMethodEnum> = {
  [PaymentMethodEnum.ONLINE]: PrismaPaymentMethodEnum.ONLINE,
  [PaymentMethodEnum.CASH]: PrismaPaymentMethodEnum.CASH,
  [PaymentMethodEnum.OTHER_PAID]: PrismaPaymentMethodEnum.OTHER_PAID,
};

export function fromPrismaPaymentMethod(method: PrismaPaymentMethodEnum | null | undefined): PaymentMethod | null {
  return method ? (PRISMA_TO_PAYMENT_METHOD[method] ?? null) : null;
}

export function toPrismaPaymentMethod(method: PaymentMethod): PrismaPaymentMethodEnum {
  return PAYMENT_METHOD_TO_PRISMA[method] ?? PrismaPaymentMethodEnum.ONLINE;
}

const PRISMA_TO_PAYMENT_ORDER_STATUS: Record<PrismaPaymentOrderStatusEnum, PaymentOrderStatus> = {
  [PrismaPaymentOrderStatusEnum.PAYING]: PaymentOrderStatusEnum.PAYING,
  [PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION]: PaymentOrderStatusEnum.PENDING_VERIFICATION,
  [PrismaPaymentOrderStatusEnum.PAID]: PaymentOrderStatusEnum.PAID,
  [PrismaPaymentOrderStatusEnum.EXPIRED]: PaymentOrderStatusEnum.EXPIRED,
  [PrismaPaymentOrderStatusEnum.UNPAID]: PaymentOrderStatusEnum.UNPAID,
};

const PAYMENT_ORDER_STATUS_TO_PRISMA: Record<PaymentOrderStatus, PrismaPaymentOrderStatusEnum> = {
  [PaymentOrderStatusEnum.PAYING]: PrismaPaymentOrderStatusEnum.PAYING,
  [PaymentOrderStatusEnum.PENDING_VERIFICATION]: PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION,
  [PaymentOrderStatusEnum.PAID]: PrismaPaymentOrderStatusEnum.PAID,
  [PaymentOrderStatusEnum.EXPIRED]: PrismaPaymentOrderStatusEnum.EXPIRED,
  [PaymentOrderStatusEnum.UNPAID]: PrismaPaymentOrderStatusEnum.UNPAID,
};

export function fromPrismaPaymentOrderStatus(status: PrismaPaymentOrderStatusEnum): PaymentOrderStatus {
  return PRISMA_TO_PAYMENT_ORDER_STATUS[status] ?? PaymentOrderStatusEnum.UNPAID;
}

export function toPrismaPaymentOrderStatus(status: PaymentOrderStatus): PrismaPaymentOrderStatusEnum {
  return PAYMENT_ORDER_STATUS_TO_PRISMA[status] ?? PrismaPaymentOrderStatusEnum.UNPAID;
}

const PRISMA_TO_CASH_VERIFY_STATUS: Record<PrismaCashVerifyStatusEnum, CashVerifyStatus> = {
  [PrismaCashVerifyStatusEnum.PENDING]: CashVerifyStatusEnum.PENDING,
  [PrismaCashVerifyStatusEnum.VERIFIED]: CashVerifyStatusEnum.VERIFIED,
};

const CASH_VERIFY_STATUS_TO_PRISMA: Record<CashVerifyStatus, PrismaCashVerifyStatusEnum> = {
  [CashVerifyStatusEnum.PENDING]: PrismaCashVerifyStatusEnum.PENDING,
  [CashVerifyStatusEnum.VERIFIED]: PrismaCashVerifyStatusEnum.VERIFIED,
};

export function fromPrismaCashVerifyStatus(status: PrismaCashVerifyStatusEnum): CashVerifyStatus {
  return PRISMA_TO_CASH_VERIFY_STATUS[status] ?? CashVerifyStatusEnum.PENDING;
}

export function toPrismaCashVerifyStatus(status: CashVerifyStatus): PrismaCashVerifyStatusEnum {
  return CASH_VERIFY_STATUS_TO_PRISMA[status] ?? PrismaCashVerifyStatusEnum.PENDING;
}

const PRISMA_TO_PAYMENT_CHANNEL: Record<PrismaPaymentChannelEnum, PaymentChannel> = {
  [PrismaPaymentChannelEnum.LAKALA]: PaymentChannelEnum.LAKALA,
  [PrismaPaymentChannelEnum.SHOUQIANBA]: PaymentChannelEnum.SHOUQIANBA,
  [PrismaPaymentChannelEnum.PINGAN_BANK]: PaymentChannelEnum.PINGAN_BANK,
};

const PAYMENT_CHANNEL_TO_PRISMA: Record<PaymentChannel, PrismaPaymentChannelEnum> = {
  [PaymentChannelEnum.LAKALA]: PrismaPaymentChannelEnum.LAKALA,
  [PaymentChannelEnum.SHOUQIANBA]: PrismaPaymentChannelEnum.SHOUQIANBA,
  [PaymentChannelEnum.PINGAN_BANK]: PrismaPaymentChannelEnum.PINGAN_BANK,
};

export function fromPrismaPaymentChannel(channel: PrismaPaymentChannelEnum): PaymentChannel {
  return PRISMA_TO_PAYMENT_CHANNEL[channel];
}

export function toPrismaPaymentChannel(channel: PaymentChannel): PrismaPaymentChannelEnum {
  return PAYMENT_CHANNEL_TO_PRISMA[channel];
}

const PRISMA_TO_PAYMENT_RECORD_STATUS: Record<PrismaPaymentRecordStatusEnum, PaymentRecordStatus> = {
  [PrismaPaymentRecordStatusEnum.PARTIAL]: PaymentRecordStatusEnum.PARTIAL,
  [PrismaPaymentRecordStatusEnum.PENDING]: PaymentRecordStatusEnum.PENDING,
  [PrismaPaymentRecordStatusEnum.FAILED]: PaymentRecordStatusEnum.FAILED,
  [PrismaPaymentRecordStatusEnum.SUCCESS]: PaymentRecordStatusEnum.SUCCESS,
};

export function fromPrismaPaymentRecordStatus(status: PrismaPaymentRecordStatusEnum): PaymentRecordStatus {
  return PRISMA_TO_PAYMENT_RECORD_STATUS[status] ?? PaymentRecordStatusEnum.SUCCESS;
}

export function cashVerifyStatusText(status: PrismaCashVerifyStatusEnum | null): string {
  if (status === PrismaCashVerifyStatusEnum.VERIFIED) return '已核销';
  if (status === PrismaCashVerifyStatusEnum.PENDING) return '待核销';
  return '无需核销';
}

const PRISMA_TO_ORDER_PAY_TYPE: Record<PrismaOrderPayTypeEnum, OrderPayType> = {
  [PrismaOrderPayTypeEnum.CASH]: OrderPayTypeEnum.CASH,
  [PrismaOrderPayTypeEnum.CREDIT]: OrderPayTypeEnum.CREDIT,
};

export function fromPrismaOrderPayType(payType: PrismaOrderPayTypeEnum): OrderPayType {
  return PRISMA_TO_ORDER_PAY_TYPE[payType] ?? OrderPayTypeEnum.CASH;
}

const PRISMA_TO_ORDER_STATUS: Record<PrismaOrderStatusEnum, OrderStatus> = {
  [PrismaOrderStatusEnum.PARTIAL]: OrderStatusEnum.PARTIAL,
  [PrismaOrderStatusEnum.PAID]: OrderStatusEnum.PAID,
  [PrismaOrderStatusEnum.EXPIRED]: OrderStatusEnum.EXPIRED,
  [PrismaOrderStatusEnum.CREDIT]: OrderStatusEnum.CREDIT,
  [PrismaOrderStatusEnum.PENDING]: OrderStatusEnum.PENDING,
};

const ORDER_STATUS_TO_PRISMA: Record<OrderStatus, PrismaOrderStatusEnum> = {
  [OrderStatusEnum.PARTIAL]: PrismaOrderStatusEnum.PARTIAL,
  [OrderStatusEnum.PAID]: PrismaOrderStatusEnum.PAID,
  [OrderStatusEnum.EXPIRED]: PrismaOrderStatusEnum.EXPIRED,
  [OrderStatusEnum.CREDIT]: PrismaOrderStatusEnum.CREDIT,
  [OrderStatusEnum.PENDING]: PrismaOrderStatusEnum.PENDING,
};

export function fromPrismaOrderStatus(status: PrismaOrderStatusEnum): OrderStatus {
  return PRISMA_TO_ORDER_STATUS[status] ?? OrderStatusEnum.PENDING;
}

export function toPrismaOrderStatus(status: OrderStatus): PrismaOrderStatusEnum {
  return ORDER_STATUS_TO_PRISMA[status] ?? PrismaOrderStatusEnum.PENDING;
}

export function toPaymentDomainOrderSnapshot(order: {
  status: PrismaOrderStatusEnum;
  voided: boolean;
  totalAmount: MoneyValue;
  paid: MoneyValue;
}): PaymentOrderAggregateSnapshot {
  return {
    status: fromPrismaOrderStatus(order.status),
    voided: order.voided,
    totalAmount: order.totalAmount,
    paid: order.paid,
  };
}

export function toPaymentDomainStatusSnapshot(paymentOrder: { status: PrismaPaymentOrderStatusEnum }) {
  return {
    status: fromPrismaPaymentOrderStatus(paymentOrder.status),
  };
}

export function toPaymentDomainExpirableSnapshot(paymentOrder: {
  status: PrismaPaymentOrderStatusEnum;
  lastInitiatedAt: Date | null;
  cashierExpiresAt?: Date | null;
}) {
  return {
    status: fromPrismaPaymentOrderStatus(paymentOrder.status),
    lastInitiatedAt: paymentOrder.lastInitiatedAt,
    cashierExpiresAt: paymentOrder.cashierExpiresAt,
  };
}

export function toPaymentDomainTransitionSnapshot(paymentOrder: {
  status: PrismaPaymentOrderStatusEnum;
  paymentMethod: PrismaPaymentMethodEnum | null;
}): PaymentOrderTransitionSnapshot {
  return {
    status: fromPrismaPaymentOrderStatus(paymentOrder.status),
    paymentMethod: fromPrismaPaymentMethod(paymentOrder.paymentMethod),
  };
}

export function toPaymentDomainSettlementSnapshot(paymentOrder: {
  status: PrismaPaymentOrderStatusEnum;
  paymentMethod: PrismaPaymentMethodEnum | null;
  amount: MoneyValue;
}): PaymentOrderTransitionSnapshot & { amount: MoneyValue } {
  return {
    ...toPaymentDomainTransitionSnapshot(paymentOrder),
    amount: paymentOrder.amount,
  };
}

export function toPrismaPaymentOrderUpdateData(data: PaymentOrderUpdateData) {
  return {
    ...data,
    status: data.status ? toPrismaPaymentOrderStatus(data.status) : undefined,
    paymentMethod: data.paymentMethod ? toPrismaPaymentMethod(data.paymentMethod) : undefined,
    channel: data.channel ? toPrismaPaymentChannel(data.channel) : undefined,
    cashVerifyStatus: data.cashVerifyStatus ? toPrismaCashVerifyStatus(data.cashVerifyStatus) : undefined,
  };
}
